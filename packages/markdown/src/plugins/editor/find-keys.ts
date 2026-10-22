/**
 * Ctrl/Cmd+F → in-note Find bar (BH-023).
 *
 * `@replit/codemirror-vim` maps `<C-f>` → page-forward by default, so with Vim
 * on the CM Mod-f keymap never runs and Find stays closed. Capture-phase
 * ownership matches BH-003 / BH-021: preventDefault + stop so Vim cannot page
 * and the workbench cannot open its empty custom-editor Find. Physical PageDown
 * still reaches vim-core (it is not Ctrl+F). Native text fields keep Ctrl+F.
 */

export interface FindKey {
  key: string;
  keyCode?: number;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/**
 * Map a keydown to Ctrl/Cmd+F. Physical KeyF (keyCode 70) covers non-Latin
 * layouts the way history-keys covers Z/Y.
 */
export function isFindKey(event: FindKey, isMac: boolean): boolean {
  const modifier = isMac
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
  if (!modifier || event.altKey || event.shiftKey) {
    return false;
  }
  const key = event.key.toLowerCase();
  return key === "f" || event.keyCode === 70;
}

/**
 * Own Mod/Ctrl+F in capture phase so Vim cannot page-forward and the shell
 * cannot open workbench Find over a custom editor.
 */
export function keepFindKey(
  target: Document,
  onFind: () => void,
  leavesNative: (target: EventTarget | null) => boolean,
): () => void {
  const isMac = /Mac|iPhone|iPad/.test(
    target.defaultView?.navigator.platform ?? "",
  );
  const listener = (event: KeyboardEvent) => {
    if (leavesNative(event.target)) {
      return;
    }
    if (!isFindKey(event, isMac)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onFind();
  };
  target.addEventListener("keydown", listener, true);
  return () => target.removeEventListener("keydown", listener, true);
}
