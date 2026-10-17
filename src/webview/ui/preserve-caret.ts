import {
  Annotation,
  type EditorSelection,
  type StateEffect,
  type Text,
} from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

/** Own restores and tagged Live Preview remaps must not supersede a pending restore. */
export const caretPreserveAnnotation = Annotation.define<
  "restore" | "livePreviewRemap"
>();

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
 * Live Preview decoration/pointer remaps that must not cancel a pending
 * `withPreservedCaret` after-layout restore. Production call sites:
 * click-position correction and fence-guard restore.
 */
export function dispatchLivePreviewSelectionRemap(
  view: EditorView,
  selection: EditorSelection,
  options?: {
    readonly effects?: StateEffect<unknown> | readonly StateEffect<unknown>[];
  },
): void {
  view.dispatch({
    selection,
    scrollIntoView: false,
    ...(options?.effects !== undefined ? { effects: options.effects } : {}),
    annotations: caretPreserveAnnotation.of("livePreviewRemap"),
  });
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
      annotations: caretPreserveAnnotation.of("restore"),
    });
  }
  view.scrollDOM.scrollTop = snapshot.scrollTop;
  view.scrollDOM.scrollLeft = snapshot.scrollLeft;
  return true;
}
