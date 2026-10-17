import type { EditorView } from "@codemirror/view";
import { restoreCaret, snapshotCaret } from "../../webview/ui/preserve-caret";
import { afterLayout } from "./layout";

/**
 * Run a reconfigure (or similar) while keeping the caret and scroll put.
 * Restores immediately, then again after layout so Live Preview decoration
 * remaps cannot leave the caret on a jumped offset.
 */
export function withPreservedCaret(view: EditorView, run: () => void): void {
  const snapshot = snapshotCaret(view);
  run();
  restoreCaret(view, snapshot);
  void afterLayout(view).then((measured) => {
    if (measured && view.dom.isConnected) {
      restoreCaret(view, snapshot);
    }
  });
}
