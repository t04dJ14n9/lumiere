import { EditorView } from "@codemirror/view";
import { selectRenderedSource } from "../../webview/ui/source-selection";

/**
 * What a click on a drawn thematic break selects: its source, the head at
 * its start, as in Obsidian. `text` is the rule's line, starting at `from`.
 */
export function ruleSelection(
  text: string,
  from: number,
): { from: number; to: number } {
  const indent = text.length - text.trimStart().length;
  return { from: from + indent, to: from + text.trimEnd().length };
}

/** A click on a drawn rule selects its source; a revealed rule is text. */
export const ruleClick = EditorView.domEventHandlers({
  mousedown(event, view) {
    const line =
      event.target instanceof Element
        ? event.target.closest(".md-hr-line:not(.is-revealed)")
        : null;
    if (
      !line ||
      event.button !== 0 ||
      event.shiftKey ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey
    ) {
      return false;
    }
    const { text, from } = view.state.doc.lineAt(view.posAtDOM(line));
    event.preventDefault();
    // Same handoff as math/callout (Host GUI A07/A08): CM + DOM selection and
    // clear the pointer freeze so the first key replaces the rule, not a
    // neighboring line while the drawn rule is still frozen.
    selectRenderedSource(view, ruleSelection(text, from), { settled: true });
    return true;
  },
});
