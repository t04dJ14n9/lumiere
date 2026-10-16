import { focusValue } from "./control-edits";

const interactiveSelector =
  "input, textarea, [contenteditable='true'], button, a, summary, [role=button], [data-property-chip]";

/** Blank row space is part of the value's hit target, as in Obsidian. */
export function bindRowValueFocus(row: HTMLElement): void {
  // pointerdown + preventDefault claims focus before cm-content keeps the caret
  // (GUI: typing otherwise lands in the note body and caret-guard undoes it).
  row.addEventListener("pointerdown", (event) => {
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
    // Only in-row controls count — CodeMirror sets the .hybrid-properties
    // wrapper to contenteditable=false, which must not look "interactive".
    const interactive = event.target.closest(interactiveSelector);
    if (
      (interactive && row.contains(interactive)) ||
      row.ownerDocument.getSelection()?.isCollapsed === false
    ) {
      return;
    }
    event.preventDefault();
    focusValue(row, "end");
  });
}
