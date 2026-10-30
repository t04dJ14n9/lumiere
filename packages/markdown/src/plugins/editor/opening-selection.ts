import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export interface OpeningSelection {
  anchor: number;
  head: number;
}

/**
 * The range a Search match should already occupy when the editor is created.
 * A caret at offset 0 is the default empty editor, not a match.
 */
export function openingEditorSelection(
  length: number,
  selection: OpeningSelection | undefined,
): OpeningSelection | undefined {
  if (!selection) {
    return undefined;
  }
  const anchor = clampOffset(selection.anchor, length);
  const head = clampOffset(selection.head, length);
  if (anchor === 0 && head === 0) {
    return undefined;
  }
  return { anchor, head };
}

/**
 * Select and scroll before the browser paints. A later reveal that repeats
 * the same range then has nothing to jump.
 */
export function placeOpeningSelection(
  view: EditorView,
  selection: OpeningSelection | undefined,
): void {
  const opening = openingEditorSelection(view.state.doc.length, selection);
  if (!opening) {
    return;
  }
  const range = EditorSelection.range(opening.anchor, opening.head);
  view.dispatch({
    selection: { anchor: opening.anchor, head: opening.head },
    effects: EditorView.scrollIntoView(range, { y: "center" }),
  });
}

function clampOffset(offset: number, length: number): number {
  if (!Number.isSafeInteger(offset) || offset < 0) {
    return 0;
  }
  return Math.min(offset, length);
}
