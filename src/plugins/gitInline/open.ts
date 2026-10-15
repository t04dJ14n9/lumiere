import { Decoration, WidgetType } from "@codemirror/view";
import type { EditorView } from "@codemirror/view";
import type { EditorState, Range } from "@codemirror/state";
import type { HunkRef } from "../../shared/git-diff";
import type { DocHunk, GitDiff } from "../gitGutter/api";

/**
 * Whether a collapsed inline click may open the hunk. A selection drag or an
 * interactive target (link, checkbox, button) keeps its own action.
 */
export function shouldOpenInlineHunk(input: {
  readonly selectionEmpty: boolean;
  readonly interactive: boolean;
}): boolean {
  if (!input.selectionEmpty) {
    return false;
  }
  return !input.interactive;
}

export function isInteractiveGitTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  return Boolean(
    target.closest(
      "a, input, button, .task-list-item-checkbox, .cm-widgetBuffer",
    ),
  );
}

class ShowDiffControl extends WidgetType {
  constructor(
    private readonly hunk: DocHunk,
    private readonly ref: HunkRef,
    private readonly diff: GitDiff,
  ) {
    super();
  }
  override eq(other: ShowDiffControl): boolean {
    return (
      other.ref.hunkId === this.ref.hunkId &&
      other.ref.generationId === this.ref.generationId
    );
  }
  override toDOM(view: EditorView): HTMLElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mw-gi-show-diff";
    button.textContent = "Show Diff";
    button.title = "Show the git change";
    button.addEventListener("click", (event) => {
      // The button itself is the opener. A nested link or checkbox, or a
      // selection drag, keeps its own action.
      const stolen =
        event.target !== button && isInteractiveGitTarget(event.target);
      const open = shouldOpenInlineHunk({
        selectionEmpty: view.state.selection.main.empty,
        interactive: stolen,
      });
      if (!open) {
        return;
      }
      const opened = showDiffOpenAt(view.state, this.diff, this.hunk, this.ref);
      if (!opened) {
        return;
      }
      event.preventDefault();
      this.diff.openHunk(opened.ref, opened.at);
    });
    return button;
  }
  override ignoreEvent(): boolean {
    return false;
  }
}

/** Tinted lines plus the Show Diff control, which is not the text hit target. */
export function lineMarks(
  state: EditorState,
  hunk: DocHunk,
  cls: string,
  diff: GitDiff,
): Range<Decoration>[] {
  const { doc } = state;
  const out: Range<Decoration>[] = [];
  const last = doc.lineAt(hunk.to).number;
  for (let n = doc.lineAt(hunk.from).number; n <= last; n++) {
    out.push(Decoration.line({ class: cls }).range(doc.line(n).from));
  }
  const control = showDiffRange(hunk, diff);
  if (control) {
    out.push(control);
  }
  return out;
}

/** A margin control, not a hit target on the highlighted text. */
export function showDiffRange(
  hunk: DocHunk,
  diff: GitDiff,
): Range<Decoration> | undefined {
  if (hunk.kind === "deleted" || typeof diff.refFor !== "function") {
    return undefined;
  }
  const ref = diff.refFor(hunk);
  if (!ref) {
    return undefined;
  }
  return Decoration.widget({
    widget: new ShowDiffControl(hunk, ref, diff),
    side: -1,
  }).range(hunk.from);
}

/**
 * Where Show Diff opens. The position is the hunk after CodeMirror has mapped
 * the decoration, not the snapshot live anchor from before that edit. The ref
 * must still be this change.
 */
export function showDiffOpenAt(
  state: EditorState,
  diff: GitDiff,
  built: DocHunk,
  ref: HunkRef,
): { at: number; ref: HunkRef } | undefined {
  const current = currentHunk(state, diff, built);
  if (!current) {
    return undefined;
  }
  const live = diff.refFor(current);
  if (!live || live.hunkId !== ref.hunkId) {
    return undefined;
  }
  return { at: current.from, ref: live };
}

/**
 * The gutter's mapped copy of a hunk a widget was built from: the one with the
 * same baseline identity. Undefined unless exactly one matches.
 */
export function currentHunk(
  state: EditorState,
  diff: GitDiff,
  hunk: DocHunk,
): DocHunk | undefined {
  const set = state.field(diff.field, false);
  const matches = (set?.hunks ?? []).filter(
    (candidate) =>
      candidate.kind === hunk.kind &&
      candidate.old === hunk.old &&
      candidate.oldLine === hunk.oldLine &&
      candidate.atEnd === hunk.atEnd,
  );
  return matches.length === 1 ? matches[0] : undefined;
}
