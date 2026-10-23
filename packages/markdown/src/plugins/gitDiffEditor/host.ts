import type { Context, Plugin } from "@workshop/core";
import type {
  DiffPanel,
  DiffSide,
  DiffViews,
  OpenedDiff,
} from "../../shared/git";
import { registerReportedCommands } from "../../shared/reported-command";
import { contributionId } from "../../shared/setting-schema";
import { describedComparison, titledComparison } from "./comparison";
import { applySideLabels, fileName, sideLabel } from "./labels";
import { openFullDiff } from "./open-snapshot";
import { prepareResources } from "./resources";
import type {} from "../resources/api";
import type {} from "../gitGutter/api";

export { fileName, sideLabel, sideLabels } from "./labels";

/** What a rendered diff compares: two URIs, the left one read-only. */
interface Comparison {
  readonly original: string;
  readonly modified: string;
  readonly column: number | undefined;
  readonly preview: boolean;
}

const identicalComparison = (comparison: Comparison) =>
  comparison.original === comparison.modified;

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
  inject: {
    required: [
      "hostDocuments",
      "hostCommands",
      "dialogs",
      "activeEditor",
      "settings",
      "workspace",
      "git",
      "diffViews",
    ],
    optional: ["diffResources"],
  },
  apply(ctx) {
    const { diffViews } = ctx;
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
      ctx.hostCommands,
      (message) => ctx.dialogs.error(message),
      [
        {
          id: contributionId("gitDiffEditor.open"),
          run: () => openActive(ctx, life),
        },
      ],
    );
    ctx.on("git-diff:open-full", (request) => {
      void openFullDiff({
        ctx,
        life,
        request,
        prepare: (comparison) => prepare(ctx, life, comparison),
        present: (comparison, prepared) =>
          present(ctx, life, comparison, prepared),
      });
    });
    ctx.effect(() =>
      diffViews.onDidOpenDiff((diff) => {
        if (
          ctx.settings.get<string>("gitDiffEditor.diffEditor", "native") ===
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
    ctx.dialogs.error(`${what}: ${reason}`);
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
  // look the workshop up again.
  const diffViews = ctx.diffViews;
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
  const note = ctx.activeEditor.note();
  const original = note ? ctx.git.toGitUri(note, "HEAD") : undefined;
  if (!note || !original) {
    ctx.dialogs.error(
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
  let text = ctx.hostDocuments.text(uri);
  if (text === undefined) {
    const document = await ctx.hostDocuments.open(uri);
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
  resources?: Parameters<DiffViews["show"]>[0]["resources"];
  /** Stop following changes. */
  stop(): void;
  /** Called with each change after the sides were read. */
  listen(onChange: () => void): void;
}

const MAX_REREADS = 5;

/** Follow both URIs until a panel takes ownership (or prepare fails). */
function beginFollow(ctx: Context, life: Life, comparison: Comparison) {
  let dirty = false;
  let onChange: (() => void) | undefined;
  const unsubscribe = followSources(ctx, comparison, () => {
    dirty = true;
    onChange?.();
  });
  let stopped = false;
  const stop = () => {
    if (!stopped) {
      stopped = true;
      life.pending.delete(stop);
      void unsubscribe();
    }
  };
  life.pending.add(stop);
  return {
    stop,
    listen(next: () => void) {
      onChange = next;
      if (dirty) {
        next();
      }
    },
    reset() {
      dirty = false;
    },
    changed: () => dirty,
  };
}

async function prepare(
  ctx: Context,
  life: Life,
  comparison: Comparison,
): Promise<Prepared | undefined> {
  if (identicalComparison(comparison)) {
    report(
      ctx,
      "Could not read the diff",
      new Error("Both sides resolve to the same URI"),
    );
    return undefined;
  }
  const follow = beginFollow(ctx, life, comparison);
  try {
    let sides: [DiffSide, DiffSide];
    let reads = 0;
    do {
      follow.reset();
      sides = await Promise.all([
        readSide(ctx, comparison.original),
        readSide(ctx, comparison.modified),
      ]);
      if (!life.live) {
        follow.stop();
        return undefined;
      }
    } while (follow.changed() && ++reads < MAX_REREADS);
    const { left, right } = applySideLabels(
      comparison.original,
      comparison.modified,
      sides[0],
      sides[1],
    );
    const resources = await prepareResources(ctx, left, right);
    return {
      left,
      right,
      resources,
      stop: follow.stop,
      listen: follow.listen,
    };
  } catch (error) {
    follow.stop();
    if (life.live) {
      report(ctx, "Could not read the diff", error);
    }
    return undefined;
  }
}

const title = (comparison: Comparison, sides: Prepared) => {
  // Structured sides travel with the panel; human labels stay on the title.
  const described = describedComparison(
    comparison.original,
    comparison.modified,
  );
  return titledComparison(
    fileName(comparison.modified),
    sides.left.label || described.base.kind,
    sides.right.label || described.target.kind,
  );
};

/** Show the panel and keep both sides current until it or the plugin ends. */
function present(
  ctx: Context,
  life: Life,
  comparison: Comparison,
  prepared: Prepared,
): void {
  // Captured while live: panel actions can arrive while the plugin stops.
  const { diffViews, hostCommands } = ctx;
  const name = title(comparison, prepared);
  const panel = diffViews.show({
    left: prepared.left,
    right: prepared.right,
    title: name,
    column: comparison.column,
    preview: comparison.preview,
    ...(prepared.resources && { resources: prepared.resources }),
    onAction(action) {
      const done =
        action === "openFile"
          ? hostCommands.execute("vscode.open", comparison.modified)
          : diffViews.openNative(
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
  life.panels.add(panel);
  // The panel owns the subscription from here; its disposal releases it.
  life.pending.delete(prepared.stop);
  panel.onDispose(() => {
    open = false;
    prepared.stop();
    life.panels.delete(panel);
  });
  watchPrepared({ ctx, life, comparison, prepared, panel, isOpen: () => open });
}

/** A versioned refresh: an older read that lands late is discarded. */
function watchPrepared(args: {
  ctx: Context;
  life: Life;
  comparison: Comparison;
  prepared: Prepared;
  panel: DiffPanel;
  isOpen: () => boolean;
}): void {
  const { ctx, life, comparison, prepared, panel, isOpen } = args;
  let version = 0;
  prepared.listen(() => {
    const mine = ++version;
    Promise.all([
      readSide(ctx, comparison.original),
      readSide(ctx, comparison.modified),
    ]).then(
      ([leftRaw, rightRaw]) => {
        if (isOpen() && life.live && mine === version) {
          const labeled = applySideLabels(
            comparison.original,
            comparison.modified,
            leftRaw,
            rightRaw,
          );
          panel.update(labeled.left, labeled.right);
        }
      },
      (error: unknown) => {
        if (isOpen() && life.live && mine === version) {
          ctx.logger.warn("Could not refresh the diff", error);
        }
      },
    );
  });
}

/** Independent subscriptions survive native TextDocument disposal. */
function followSources(
  ctx: Context,
  comparison: Comparison,
  notify: () => void,
) {
  const { hostDocuments, git, workspace } = ctx;
  const uris = [comparison.original, comparison.modified];
  const subscriptions = [
    hostDocuments.onChange((document) => {
      if (uris.includes(document.uri)) {
        notify();
      }
    }),
  ];
  if (uris.some((uri) => uri.startsWith("git:"))) {
    const stop = git.onDidChange(notify);
    if (stop) {
      subscriptions.push(stop);
    }
  }
  for (const uri of new Set(uris.filter((uri) => !uri.startsWith("git:")))) {
    const stop = workspace.watch(uri, notify);
    if (stop) {
      subscriptions.push(stop);
    }
  }
  return () => subscriptions.forEach((stop) => void stop());
}
