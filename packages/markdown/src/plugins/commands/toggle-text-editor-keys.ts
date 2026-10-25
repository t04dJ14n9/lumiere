/**
 * Ctrl/Cmd+E → Toggle Text Editor (BH-003).
 *
 * VS Code forwards webview keydowns to the workbench, but @replit/codemirror-vim
 * handles Ctrl+E as scroll-window first. Capture-phase ownership matches
 * history-keys / BH-006: preventDefault + stop so Vim cannot scroll, then the
 * note runs `toggleTextEditor` (Lumière product choice over Obsidian-vim scroll).
 */

export interface ToggleTextEditorKey {
  key: string;
  keyCode?: number;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/**
 * Map a keydown to the Ctrl/Cmd+E toggle. Physical KeyE (keyCode 69) covers
 * non-Latin layouts the way history-keys covers Z/Y.
 */
export function isToggleTextEditorKey(
  event: ToggleTextEditorKey,
  isMac: boolean,
): boolean {
  const modifier = isMac
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
  if (!modifier || event.altKey || event.shiftKey) {
    return false;
  }
  const key = event.key.toLowerCase();
  return key === "e" || event.keyCode === 69;
}

/**
 * Own Mod/Ctrl+E in capture phase so Vim cannot scroll and the shell cannot
 * double-fire. Native text fields keep their own shortcuts.
 */
export function keepToggleTextEditorKey(
  target: Document,
  onToggle: () => void,
  leavesNative: (target: EventTarget | null) => boolean,
): () => void {
  const isMac = /Mac|iPhone|iPad/.test(
    target.defaultView?.navigator.platform ?? "",
  );
  const listener = (event: KeyboardEvent) => {
    if (leavesNative(event.target)) {
      return;
    }
    if (!isToggleTextEditorKey(event, isMac)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onToggle();
  };
  target.addEventListener("keydown", listener, true);
  return () => target.removeEventListener("keydown", listener, true);
}
