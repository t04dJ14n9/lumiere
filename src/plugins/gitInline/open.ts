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
      event.preventDefault();
      this.diff.openHunk(this.ref);
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
    widget: new ShowDiffControl(ref, diff),
    side: -1,
  }).range(hunk.from);
}
