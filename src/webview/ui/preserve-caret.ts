import type { EditorSelection, Text } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

/** Snapshot of caret + scroll to restore across extension remounts. */
export type CaretSnapshot = {
  readonly selection: EditorSelection;
  readonly scrollTop: number;
  readonly scrollLeft: number;
  readonly doc: Text;
};

/** Capture the current selection and scroll position. */
export function snapshotCaret(view: EditorView): CaretSnapshot {
  return {
    selection: view.state.selection,
    scrollTop: view.scrollDOM.scrollTop,
    scrollLeft: view.scrollDOM.scrollLeft,
    doc: view.state.doc,
  };
}

/** True when every range still fits the document. */
export function selectionFitsDoc(
  selection: EditorSelection,
  doc: { readonly length: number },
): boolean {
  const length = doc.length;
  return selection.ranges.every(
    (range) =>
      range.from >= 0 &&
      range.to <= length &&
      range.anchor >= 0 &&
      range.anchor <= length &&
      range.head >= 0 &&
      range.head <= length,
  );
}

/**
 * Restore a captured selection (and scroll) when still valid for the doc.
 * Returns false when the document changed or ranges no longer fit.
 */
export function restoreCaret(
  view: EditorView,
  snapshot: CaretSnapshot,
): boolean {
  // Remounts must not rewrite carets across an intervening document edit.
  if (!view.state.doc.eq(snapshot.doc)) {
    return false;
  }
  if (!selectionFitsDoc(snapshot.selection, view.state.doc)) {
    return false;
  }
  if (!snapshot.selection.eq(view.state.selection)) {
    view.dispatch({
      selection: snapshot.selection,
      scrollIntoView: false,
    });
  }
  view.scrollDOM.scrollTop = snapshot.scrollTop;
  view.scrollDOM.scrollLeft = snapshot.scrollLeft;
  return true;
}
