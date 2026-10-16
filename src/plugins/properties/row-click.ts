import { focusValue } from "./control-edits";

const interactiveSelector =
  "input, textarea, [contenteditable], button, a, summary, [role=button], [data-property-chip]";

/** Blank row space is part of the value's hit target, as in Obsidian. */
export function bindRowValueFocus(row: HTMLElement): void {
  row.addEventListener("click", (event) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.shiftKey ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      !(event.target instanceof Element)
    ) {
      return;
    }
    // Keep native caret placement, pill actions and injected source links.
    // Ignore ancestors outside the row (CodeMirror marks .hybrid-properties
    // contenteditable=false on the widget wrapper).
    const interactive = event.target.closest(interactiveSelector);
    if (
      (interactive && row.contains(interactive)) ||
      row.ownerDocument.getSelection()?.isCollapsed === false
    ) {
      return;
    }
    focusValue(row, "end");
  });
}
