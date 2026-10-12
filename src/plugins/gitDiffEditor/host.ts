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
export const gitDiffEditorHost: Plugin = {
  name: "gitDiffEditor",
  inject: { required: ["workbench"] },
  apply(ctx) {
    const { views, diffViews } = ctx.workbench;
    if (!views || !diffViews) {
      return;
    }
    const panels = new Set<DiffPanel>();
    ctx.effect(() => () => {
      for (const panel of [...panels]) {
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
          run: () => openActive(ctx, panels),
        },
      ],
    );
    ctx.effect(() =>
      diffViews.onDidOpenDiff((diff) => {
        if (
          views.setting<string>("gitDiffEditor.diffEditor", "native") ===
          "rendered"
        ) {
          void takeOver(ctx, panels, diff);
        }
      }),
    );
  },
};

async function takeOver(
  ctx: Context,
  panels: Set<DiffPanel>,
  diff: OpenedDiff,
) {
  await diff.close();
  await open(ctx, panels, diff);
}

async function openActive(ctx: Context, panels: Set<DiffPanel>): Promise<void> {
  const note = ctx.workbench.views?.activeNote();
  const original = note ? ctx.workbench.git?.toGitUri(note, "HEAD") : undefined;
  if (!note || !original) {
    ctx.workbench.error(
      "Open a Markdown note in a git repository to compare it with HEAD.",
    );
    return;
  }
  await open(ctx, panels, {
    original,
    modified: note,
    column: undefined,
    preview: false,
  });
}

async function readSide(ctx: Context, uri: string): Promise<DiffSide> {
  const text =
    ctx.workbench.views?.documentText(uri) ??
    (await ctx.workbench.openDocument?.(uri))?.getText() ??
    "";
  return { uri, label: sideLabel(uri), text: text.replace(/\r\n?/g, "\n") };
}

async function open(
  ctx: Context,
  panels: Set<DiffPanel>,
  comparison: Comparison,
): Promise<void> {
  const workbench = ctx.workbench;
  const [left, right] = await Promise.all([
    readSide(ctx, comparison.original),
    readSide(ctx, comparison.modified),
  ]);
  const name = fileName(comparison.modified);
  const panel = workbench.diffViews!.show({
    left,
    right,
    title: `${name} (${left.label} ↔ ${right.label})`,
    column: comparison.column,
    preview: comparison.preview,
    onAction(action) {
      if (action === "openFile") {
        void workbench.execute("vscode.open", comparison.modified);
      } else {
        void workbench.diffViews!.openNative(
          comparison.original,
          comparison.modified,
          `${name} (${left.label} ↔ ${right.label})`,
          comparison.column,
        );
      }
    },
  });
  panels.add(panel);
  // Keep the right side current while the note is edited.
  const stop = workbench.onChange((document) => {
    if (document.uri === comparison.modified) {
      void readSide(ctx, comparison.modified).then((next) =>
        panel.update(left, next),
      );
    }
  });
  panel.onDispose(() => {
    void stop();
    panels.delete(panel);
  });
}
