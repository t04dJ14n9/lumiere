import { focusValue } from "./control-edits";

const interactiveSelector =
  "input, textarea, [contenteditable='true'], button, a, summary, [role=button], [data-property-chip]";

/** Blank row / value chrome is part of the value hit target (Obsidian parity). */
export function bindRowValueFocus(row: HTMLElement): void {
  // pointerdown + preventDefault claims focus before cm-content keeps the caret.
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
    const target = event.target;
    // Keep native caret placement, pill actions and injected source links.
    // Only in-row controls count — the CM .hybrid-properties wrapper is
    // contenteditable=false and must not look interactive.
    const interactive = target.closest(interactiveSelector);
    if (
      (interactive && row.contains(interactive)) ||
      row.ownerDocument.getSelection()?.isCollapsed === false
    ) {
      return;
    }
    // Custom Sources rows (and other renderer text) must stay selectable;
    // only blank chrome routes focus into the value editor.
    if (!blankValueHit(row, target)) {
      return;
    }
    event.preventDefault();
    focusValue(row, "end");
  });
}

/** True for empty row/value chrome, not nested custom markup or field text. */
function blankValueHit(row: HTMLElement, target: Element): boolean {
  if (target === row) {
    return true;
  }
  return [
    "metadata-property-value",
    "property-complex",
    "source-rows",
    "property-list",
    "multi-select-container",
    "property-empty",
  ].some((name) => target.classList.contains(name));
}
