import type { Context, Plugin } from "../../kernel";
import type { DiffPanel, DiffSide, OpenedDiff } from "../../shared/git";
import { registerReportedCommands } from "../../shared/reported-command";

/** What a rendered diff compares: two URIs, the left one read-only. */
interface Comparison {
  readonly original: string;
  readonly modified: string;
  readonly column: number | undefined;
  readonly preview: boolean;
}

const fileName = (uri: string) =>
  decodeURIComponent(
    uri
      .replace(/[?#].*$/, "")
      .split("/")
      .pop() ?? uri,
  );

/** "HEAD", "Index" or "Working tree", from a git: URI's query or its scheme. */
export function sideLabel(uri: string): string {
  if (!uri.startsWith("git:")) {
    return "Working tree";
  }
  try {
    const query = decodeURIComponent(uri.slice(uri.indexOf("?") + 1));
    const ref = (JSON.parse(query) as { ref?: string }).ref ?? "";
    if (ref === "" || ref === "~") {
      return "Index";
    }
    return /^[0-9a-f]{40}$/.test(ref) ? ref.slice(0, 7) : ref;
  } catch {
    return "Git";
  }
}

/**
 * Rendered side-by-side diffs. With `diffEditor: rendered` it takes over
 * Markdown text diffs as VS Code opens them (Source Control, Timeline); the
 * command opens one against HEAD for the active note in either mode.
 */
/** The plugin's lifetime: false once it is turned off. */
interface Life {
  live: boolean;
  readonly panels: Set<DiffPanel>;
  /** Cleanups of preparations no panel owns yet; run on disposal. */
  readonly pending: Set<() => void>;
}

export const gitDiffEditorHost: Plugin = {
  name: "gitDiffEditor",
  inject: { required: ["workbench"] },
  apply(ctx) {
    const { views, diffViews } = ctx.workbench;
    if (!views || !diffViews) {
      return;
    }
    const life: Life = { live: true, panels: new Set(), pending: new Set() };
    ctx.effect(() => () => {
      life.live = false;
      for (const stop of [...life.pending]) {
        stop();
      }
      for (const panel of [...life.panels]) {
        panel.dispose();
      }
    });
    const effect = (setup: () => () => void) => {
      ctx.effect(setup);
    };
    registerReportedCommands(
      effect,
      views,
      (message) => ctx.workbench.error(message),
      [
        {
          id: "markdownWorkbench.gitDiffEditor.open",
          run: () => openActive(ctx, life),
        },
      ],
    );
    ctx.effect(() =>
      diffViews.onDidOpenDiff((diff) => {
        if (
          views.setting<string>("gitDiffEditor.diffEditor", "native") ===
          "rendered"
        ) {
          takeOver(ctx, life, diff).catch((error: unknown) =>
            report(ctx, "Could not open the rendered diff", error),
          );
        }
      }),
    );
  },
};

function report(ctx: Context, what: string, error: unknown): void {
  ctx.logger.warn(what, error);
  const reason = error instanceof Error ? error.message : String(error);
  try {
    ctx.workbench.error(`${what}: ${reason}`);
  } catch {
    // Reporting must not throw out of an event handler.
  }
}

/**
 * Replace a native text diff. The comparison is prepared while the native
 * tab stays open; the tab is closed only when that worked, and a replacement
 * that then fails reopens the native diff.
 */
async function takeOver(ctx: Context, life: Life, diff: OpenedDiff) {
  // Captured while the plugin is live: recovery after disposal must not
  // look the workbench up again.
  const diffViews = ctx.workbench.diffViews!;
  const logger = ctx.logger;
  const prepared = await prepare(ctx, life, diff);
  if (!prepared || !life.live) {
    prepared?.stop();
    return;
  }
  let closed = false;
  try {
    closed = await diff.close();
  } catch (error) {
    logger.warn("The native diff did not close", error);
  }
  const restore = () =>
    diffViews.openNative(
      diff.original,
      diff.modified,
      title(diff, prepared),
      diff.column,
    );
  if (!closed) {
    // A dirty or refused tab stays open; nothing replaces it.
    prepared.stop();
    return;
  }
  if (!life.live) {
    // The tab closed after the plugin was turned off: put it back.
    prepared.stop();
    await restore();
    return;
  }
  try {
    present(ctx, life, diff, prepared);
  } catch (error) {
    prepared.stop();
    report(ctx, "Could not open the rendered diff", error);
    await restore();
  }
}

async function openActive(ctx: Context, life: Life): Promise<void> {
  const note = ctx.workbench.views?.activeNote();
  const original = note ? ctx.workbench.git?.toGitUri(note, "HEAD") : undefined;
  if (!note || !original) {
    ctx.workbench.error(
      "Open a Markdown note in a git repository to compare it with HEAD.",
    );
    return;
  }
  const comparison = {
    original,
    modified: note,
    column: undefined,
    preview: false,
  };
  const prepared = await prepare(ctx, life, comparison);
  if (!prepared) {
    return;
  }
  if (!life.live) {
    prepared.stop();
    return;
  }
  try {
    present(ctx, life, comparison, prepared);
  } catch (error) {
    // Until a panel owns it, the subscription is ours to release.
    prepared.stop();
    throw error;
  }
}

/** One side's text; a side that cannot be read is an error, not empty. */
async function readSide(ctx: Context, uri: string): Promise<DiffSide> {
  let text = ctx.workbench.views?.documentText(uri);
  if (text === undefined) {
    const document = await ctx.workbench.openDocument?.(uri);
    if (!document) {
      throw new Error(`${sideLabel(uri)} is not available`);
    }
    text = document.getText();
  }
  return { uri, label: sideLabel(uri), text: text.replace(/\r\n?/g, "\n") };
}

/** Both sides, read again until no change arrived while reading. */
interface Prepared {
  left: DiffSide;
  right: DiffSide;
  /** Stop following changes. */
  stop(): void;
  /** Called with each change after the sides were read. */
  listen(onChange: () => void): void;
}

const MAX_REREADS = 5;

async function prepare(
  ctx: Context,
  life: Life,
  comparison: Comparison,
): Promise<Prepared | undefined> {
  // Subscribe before reading, so an edit during the first read is seen.
  let changed = false;
  let onChange: (() => void) | undefined;
  const unsubscribe = ctx.workbench.onChange((document) => {
    if (
      document.uri === comparison.modified ||
      document.uri === comparison.original
    ) {
      changed = true;
      onChange?.();
    }
  });
  let stopped = false;
  const stop = () => {
    if (!stopped) {
      stopped = true;
      life.pending.delete(stop);
      void unsubscribe();
    }
  };
  // Owned by the plugin until a panel takes it over.
  life.pending.add(stop);
  try {
    let sides: [DiffSide, DiffSide];
    let reads = 0;
    do {
      changed = false;
      sides = await Promise.all([
        readSide(ctx, comparison.original),
        readSide(ctx, comparison.modified),
      ]);
      if (!life.live) {
        stop();
        return undefined;
      }
    } while (changed && ++reads < MAX_REREADS);
    const [left, right] = sides;
    return {
      left,
      right,
      stop,
      listen(next) {
        onChange = next;
        if (changed) {
          next();
        }
      },
    };
  } catch (error) {
    stop();
    if (life.live) {
      report(ctx, "Could not read the diff", error);
    }
    return undefined;
  }
}

const title = (comparison: Comparison, sides: Prepared) =>
  `${fileName(comparison.modified)} (${sides.left.label} ↔ ${sides.right.label})`;

/** Show the panel and keep both sides current until it or the plugin ends. */
function present(
  ctx: Context,
  life: Life,
  comparison: Comparison,
  prepared: Prepared,
): void {
  const workbench = ctx.workbench;
  const name = title(comparison, prepared);
  const panel = workbench.diffViews!.show({
    left: prepared.left,
    right: prepared.right,
    title: name,
    column: comparison.column,
    preview: comparison.preview,
    onAction(action) {
      const done =
        action === "openFile"
          ? workbench.execute("vscode.open", comparison.modified)
          : workbench.diffViews!.openNative(
              comparison.original,
              comparison.modified,
              name,
              comparison.column,
            );
      void Promise.resolve(done).catch((error: unknown) =>
        report(ctx, "Could not open", error),
      );
    },
  });
  let open = true;
  let version = 0;
  life.panels.add(panel);
  // The panel owns the subscription from here; its disposal releases it.
  life.pending.delete(prepared.stop);
  panel.onDispose(() => {
    open = false;
    version++;
    prepared.stop();
    life.panels.delete(panel);
  });
  // A versioned refresh: an older read that lands late is discarded.
  prepared.listen(() => {
    const mine = ++version;
    Promise.all([
      readSide(ctx, comparison.original),
      readSide(ctx, comparison.modified),
    ]).then(
      ([left, right]) => {
        if (open && life.live && mine === version) {
          panel.update(left, right);
        }
      },
      (error: unknown) => {
        if (open && life.live && mine === version) {
          ctx.logger.warn("Could not refresh the diff", error);
        }
      },
    );
  });
}
