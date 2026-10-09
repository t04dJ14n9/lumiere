/**
 * VS Code forwards every keydown in a webview to the workbench, from a
 * listener on the webview's window. For Ctrl/Cmd+A the workbench then runs
 * its own Select All, which reaches us as `document.execCommand("selectAll")`
 * after CodeMirror has already selected the note. That selects the whole
 * page (the inline title and gutter) and CodeMirror reads it back as a
 * caret at the end of the note. When our editor has handled the key, it
 * must stop before the window listener so VS Code does not select again.
 */
export interface SelectAllKey {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  defaultPrevented: boolean;
}

/** Whether VS Code would also run Select All for a key we already handled. */
export function isHandledSelectAll(
  event: SelectAllKey,
  isMac: boolean,
): boolean {
  const hasModifier = isMac
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
  return (
    event.defaultPrevented &&
    hasModifier &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === "a"
  );
}

/**
 * Stops a handled Select All at the document, before VS Code's listener on
 * the window. Unhandled ones (in a text box) still reach VS Code, whose
 * Select All then selects that box's text as usual.
 */
export function keepSelectAllInEditor(target: Document): () => void {
  const isMac = /Mac|iPhone|iPad/.test(
    target.defaultView?.navigator.platform ?? "",
  );
  const listener = (event: KeyboardEvent) => {
    if (isHandledSelectAll(event, isMac)) {
      event.stopPropagation();
    }
  };
  target.addEventListener("keydown", listener);
  return () => target.removeEventListener("keydown", listener);
}
