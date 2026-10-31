/**
 * Whether a keyboard/clipboard event target lives inside a field that should
 * keep Delete/Backspace/copy for editing, not PDF commands.
 *
 * Treats contenteditable / "" / "true" as editable; only explicit false is not.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest(
      'input, textarea, [contenteditable]:not([contenteditable="false"])',
    ) !== null
  );
}
