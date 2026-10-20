import { EditorView } from "@codemirror/view";
import { selectRenderedSource } from "../../webview/ui/source-selection";

/**
 * Hand a footnote-reference click to the definition caret.
 *
 * Plain `dispatch({ selection })` left CodeMirror's range at the marker while
 * the DOM caret could stay on the superscript button (and any pointer reveal
 * freeze stayed armed), so the first keys missed the definition — the same
 * caret-lie class as math/callout (#233) and drawn HR (#237).
 */
export function selectFootnoteDefinition(view: EditorView, at: number): void {
  const pos = Math.min(view.state.doc.length, Math.max(0, at));
  selectRenderedSource(view, { from: pos, to: pos }, { settled: true });
  view.dispatch({
    effects: EditorView.scrollIntoView(pos),
  });
}
