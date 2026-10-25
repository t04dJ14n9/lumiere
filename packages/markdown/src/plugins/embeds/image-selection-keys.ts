/**
 * DOM key → selected-image keymap id (BH-006). Pure; no EditorView deps.
 */

type KeyBits = Pick<
  KeyboardEvent,
  "key" | "code" | "shiftKey" | "ctrlKey" | "altKey" | "metaKey"
>;

const PLAIN: Readonly<Record<string, string>> = {
  Escape: "Escape",
  Enter: "Enter",
  Tab: "Tab",
  Backspace: "Backspace",
  Delete: "Delete",
  ArrowRight: "ArrowRight",
  ArrowLeft: "ArrowLeft",
  "+": "+",
};

/**
 * Map a DOM keydown to the image-selection keymap id (`Space`, `+`, …).
 * Returns undefined when the event is not an image key (or has Mod/Alt).
 */
export function imageKeyFromEvent(event: KeyBits): string | undefined {
  if (event.ctrlKey || event.altKey || event.metaKey) {
    return undefined;
  }
  if (event.key === " " || event.code === "Space") {
    return "Space";
  }
  const plain = PLAIN[event.key];
  if (plain) {
    return plain;
  }
  return sizedKey(event);
}

/** `=`/`+` grow, `-` shrink, `0` clear — ignore when Shift makes another glyph. */
function sizedKey(event: KeyBits): string | undefined {
  if (event.key === "=" || event.code === "Equal") {
    return event.shiftKey ? "+" : "=";
  }
  if (event.key === "-" || event.code === "Minus") {
    return event.shiftKey ? undefined : "-";
  }
  if (event.key === "0" || event.code === "Digit0") {
    return event.shiftKey ? undefined : "0";
  }
  return undefined;
}
