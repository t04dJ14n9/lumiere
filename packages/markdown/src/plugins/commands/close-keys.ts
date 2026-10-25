/**
 * Ctrl/Cmd+W → Close active editor (BH-031), except Vim INSERT (BH-044).
 *
 * VS Code forwards webview keydowns to the workbench, but @replit/codemirror-vim
 * handles Ctrl+W as a window-command prefix first in NORMAL. Capture-phase
 * ownership matches history-keys / BH-003 / BH-021: preventDefault + stop so
 * Vim cannot start `<C-w>`, then the note runs host `close`
 * (`workbench.action.closeActiveEditor`).
 *
 * In INSERT, vim-core maps `<C-w>` → delete the previous word (idle in NORMAL).
 * Closing the tab there would steal Obsidian/vim parity (BH-044), so callers
 * may gate Close and replay insert `<C-w>` instead. Native text fields keep
 * their own shortcuts.
 */

export interface CloseKey {
  key: string;
  keyCode?: number;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/**
 * Map a keydown to Ctrl/Cmd+W. Physical KeyW (keyCode 87) covers non-Latin
 * layouts the way history-keys covers Z/Y.
 */
export function isCloseKey(event: CloseKey, isMac: boolean): boolean {
  const modifier = isMac
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
  if (!modifier || event.altKey || event.shiftKey) {
    return false;
  }
  const key = event.key.toLowerCase();
  return key === "w" || event.keyCode === 87;
}

export interface KeepCloseKeyOptions {
  /**
   * When true, Ctrl/Cmd+W is vim INSERT delete-word — do not close the tab.
   * BH-044: Obsidian/vim parity for `<C-w>` in insert.
   */
  isInsertMode?: () => boolean;
  /** Run instead of close when `isInsertMode()` is true (replay `<C-w>`). */
  onInsertCtrlW?: () => void;
}

/**
 * Own Mod/Ctrl+W in capture phase so Vim cannot start a window command and the
 * shell cannot double-fire. Native text fields keep their own shortcuts.
 * Optional insert-mode gate leaves delete-word to vim-core (BH-044).
 */
export function keepCloseKey(
  target: Document,
  onClose: () => void,
  leavesNative: (target: EventTarget | null) => boolean,
  options: KeepCloseKeyOptions = {},
): () => void {
  const isMac = /Mac|iPhone|iPad/.test(
    target.defaultView?.navigator.platform ?? "",
  );
  const listener = (event: KeyboardEvent) => {
    if (leavesNative(event.target)) {
      return;
    }
    if (!isCloseKey(event, isMac)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (options.isInsertMode?.()) {
      options.onInsertCtrlW?.();
      return;
    }
    onClose();
  };
  target.addEventListener("keydown", listener, true);
  return () => target.removeEventListener("keydown", listener, true);
}
