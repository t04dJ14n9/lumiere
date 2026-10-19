/** The keys of a keydown that matter for Select All. */
export interface SelectAllKey {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/** Whether a key is Select All: Cmd+A on macOS (Ctrl+A moves there), Ctrl+A elsewhere. */
export function isSelectAll(event: SelectAllKey, isMac: boolean): boolean {
  const modifier = isMac
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
  return (
    modifier &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === "a"
  );
}

const FIELD = "input, textarea, [contenteditable='true']";

/**
 * Ctrl/Cmd+A in a property field selects the field's text, as in Obsidian.
 * The browser's own Select All, in a field inside the editor, selects the
 * whole note and moves the caret into it, so the next keys type into the
 * note. The key is handled here and goes no further, so VS Code does not run
 * its Select All either.
 */
export function keepSelectAllInField(root: HTMLElement): () => void {
  const isMac = /Mac|iPhone|iPad/u.test(
    root.ownerDocument.defaultView?.navigator.platform ?? "",
  );
  const listener = (event: KeyboardEvent) => {
    const field =
      event.target instanceof HTMLElement
        ? event.target.closest<HTMLElement>(FIELD)
        : null;
    if (!field || !root.contains(field) || !isSelectAll(event, isMac)) {
      return;
    }
    if (
      field instanceof HTMLInputElement ||
      field instanceof HTMLTextAreaElement
    ) {
      field.select();
    } else {
      const range = field.ownerDocument.createRange();
      range.selectNodeContents(field);
      const selection = field.ownerDocument.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    event.preventDefault();
    event.stopPropagation();
  };
  root.addEventListener("keydown", listener);
  return () => root.removeEventListener("keydown", listener);
}
