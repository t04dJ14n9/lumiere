/**
 * Ctrl/Cmd+P → Quick Open, unless suggest can consume it (BH-021).
 *
 * `@replit/codemirror-vim` maps `<C-p>` → `k` by default (unmap while Vim is
 * on). Capture-phase ownership still matters so the workbench forwarder cannot
 * race an open completion list: try `moveCompletionSelection` first; only if
 * that returns false run host Quick Open.
 */

export interface QuickOpenKey {
  key: string;
  keyCode?: number;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/**
 * Map a keydown to Ctrl/Cmd+P. Physical KeyP (keyCode 80) covers non-Latin
 * layouts the way history-keys covers Z/Y.
 */
export function isQuickOpenKey(event: QuickOpenKey, isMac: boolean): boolean {
  const modifier = isMac
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
  if (!modifier || event.altKey || event.shiftKey) {
    return false;
  }
  const key = event.key.toLowerCase();
  return key === "p" || event.keyCode === 80;
}

/**
 * Own Mod/Ctrl+P in capture phase. `trySuggest` should run CM
 * `moveCompletionSelection(false)` and return whether it handled the key.
 */
export function keepQuickOpenKey(
  target: Document,
  onQuickOpen: () => void,
  leavesNative: (target: EventTarget | null) => boolean,
  trySuggest: () => boolean,
): () => void {
  const isMac = /Mac|iPhone|iPad/.test(
    target.defaultView?.navigator.platform ?? "",
  );
  const listener = (event: KeyboardEvent) => {
    if (leavesNative(event.target)) {
      return;
    }
    if (!isQuickOpenKey(event, isMac)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (trySuggest()) {
      return;
    }
    onQuickOpen();
  };
  target.addEventListener("keydown", listener, true);
  return () => target.removeEventListener("keydown", listener, true);
}
