import { StateField } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import {
  caretPreserveAnnotation,
  dispatchLivePreviewSelectionRemap,
  restoreCaret,
  snapshotCaret,
} from "../../webview/ui/preserve-caret";
import { afterLayout } from "./layout";

/** Tagged restore / Live Preview remaps must not supersede a pending restore. */
export const caretRestoreGeneration = StateField.define<number>({
  create: () => 0,
  update(generation, transaction) {
    if (transaction.docChanged) {
      return generation + 1;
    }
    if (
      transaction.selection &&
      !transaction.annotation(caretPreserveAnnotation)
    ) {
      // Vim motions and other unannotated selections supersede; LP remaps use
      // dispatchLivePreviewSelectionRemap (click-position, fence-guard).
      return generation + 1;
    }
    return generation;
  },
});

export { caretPreserveAnnotation, dispatchLivePreviewSelectionRemap };

/**
 * Run a reconfigure (or similar) while keeping the caret and scroll put.
 * Restores immediately, then again after layout so Live Preview decoration
 * remaps cannot leave the caret on a jumped offset.
 */
export function withPreservedCaret(
  view: EditorView,
  run: () => void,
  waitForLayout = afterLayout,
): void {
  const snapshot = snapshotCaret(view);
  run();
  if (!restoreCaret(view, snapshot)) {
    return;
  }
  const generation = view.state.field(caretRestoreGeneration);
  const { scrollDOM } = view;
  const { scrollTop, scrollLeft } = scrollDOM;
  let superseded = false;
  // Latch scroll excursions, and recheck at completion before queued events fire.
  const scrollUnchanged = () =>
    scrollDOM.scrollTop === scrollTop && scrollDOM.scrollLeft === scrollLeft;
  const onScroll = () => {
    superseded ||= !scrollUnchanged();
  };
  scrollDOM.addEventListener("scroll", onScroll);
  void waitForLayout(view).then((measured) => {
    scrollDOM.removeEventListener("scroll", onScroll);
    if (
      measured &&
      view.dom.isConnected &&
      !superseded &&
      scrollUnchanged() &&
      view.state.field(caretRestoreGeneration) === generation
    ) {
      restoreCaret(view, snapshot);
    }
  });
}
