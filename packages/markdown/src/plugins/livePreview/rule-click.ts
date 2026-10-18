import { EditorView } from "@codemirror/view";

/**
 * What a click on a drawn thematic break selects: its source, the head at
 * its start, as in Obsidian. `text` is the rule's line, starting at `from`.
 */
export function ruleSelection(
  text: string,
  from: number,
): { anchor: number; head: number } {
  const indent = text.length - text.trimStart().length;
  return { anchor: from + text.trimEnd().length, head: from + indent };
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
    view.focus();
    view.dispatch({ selection: ruleSelection(text, from) });
    return true;
  },
});
