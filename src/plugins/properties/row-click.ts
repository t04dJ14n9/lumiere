import { focusValue } from "./control-edits";

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
    if (
      event.target.closest(
        "input, textarea, [contenteditable], button, a, summary, [role=button], [data-property-chip]",
      ) ||
      row.ownerDocument.getSelection()?.isCollapsed === false
    ) {
      return;
    }
    focusValue(row, "end");
  });
}
