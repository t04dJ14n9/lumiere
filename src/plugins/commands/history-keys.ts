export interface HistoryKey {
  key: string;
  keyCode?: number;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  defaultPrevented: boolean;
}

/** Only shortcuts already consumed by the editor belong to its RPC history. */
export function isHandledHistoryKey(
  event: HistoryKey,
  isMac: boolean,
): boolean {
  const modifier = isMac
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
  const key = event.key.toLowerCase();
  // CodeMirror falls back to physical Latin keys for non-Latin layouts;
  // VS Code's forwarding also recognizes these legacy key codes.
  const undoKey = key === "z" || event.keyCode === 90;
  const redoKey = key === "y" || event.keyCode === 89;
  return (
    event.defaultPrevented &&
    modifier &&
    !event.altKey &&
    (undoKey || (redoKey && !event.shiftKey))
  );
}

/**
 * VS Code forwards webview keydowns even after preventDefault. Stop handled
 * undo/redo before its window listener, or a key runs both our flush/grouped
 * history action and the workbench's native action. The document boundary
 * covers the main editor, projected table cells and Vim's handled shortcuts.
 */
export function keepHistoryKeysInEditor(target: Document): () => void {
  const isMac = /Mac|iPhone|iPad/.test(
    target.defaultView?.navigator.platform ?? "",
  );
  const listener = (event: KeyboardEvent) => {
    if (isHandledHistoryKey(event, isMac)) {
      event.stopPropagation();
    }
  };
  target.addEventListener("keydown", listener);
  return () => target.removeEventListener("keydown", listener);
}
