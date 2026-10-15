export interface HistoryKey {
  key: string;
  keyCode?: number;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export type HistoryAction = "undo" | "redo";

/**
 * Map a keydown to the note's flush-then-native history action. CodeMirror falls
 * back to physical Latin keys for non-Latin layouts; VS Code's webview forwarder
 * also matches those legacy key codes.
 */
export function historyActionFor(
  event: HistoryKey,
  isMac: boolean,
): HistoryAction | undefined {
  const modifier = isMac
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
  if (!modifier || event.altKey) {
    return undefined;
  }
  const key = event.key.toLowerCase();
  const undoKey = key === "z" || event.keyCode === 90;
  const redoKey = key === "y" || event.keyCode === 89;
  if (undoKey) {
    return event.shiftKey ? "redo" : "undo";
  }
  if (redoKey && !event.shiftKey) {
    return "redo";
  }
  return undefined;
}

/**
 * INPUT/TEXTAREA keep VS Code's DOM undo. Tag names (not instanceof) so the
 * check works across the webview iframe realm and in unit tests.
 */
export function isNativeTextField(target: EventTarget | null): boolean {
  if (!target || !("tagName" in target)) {
    return false;
  }
  const tag = String(
    (target as { tagName?: string }).tagName ?? "",
  ).toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA";
}

/**
 * VS Code's webview shell listens on the content window and always preventDefaults
 * then forwards undo/redo to the workbench, even when the note already handled the
 * key. Owning Mod/Ctrl+Z, Mod/Ctrl+Shift+Z and Mod/Ctrl+Y in capture phase runs
 * flush/grouped history once and stops the shell from seeing the event. Nested
 * surfaces (table cells, property chips) share this document, so one listener
 * covers them; native text fields are left alone.
 */
export function keepHistoryKeysInEditor(
  target: Document,
  onHistory: (action: HistoryAction) => void,
): () => void {
  const isMac = /Mac|iPhone|iPad/.test(
    target.defaultView?.navigator.platform ?? "",
  );
  const listener = (event: KeyboardEvent) => {
    if (isNativeTextField(event.target)) {
      return;
    }
    const action = historyActionFor(event, isMac);
    if (!action) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onHistory(action);
  };
  target.addEventListener("keydown", listener, true);
  return () => target.removeEventListener("keydown", listener, true);
}
