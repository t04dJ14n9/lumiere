/**
 * Ctrl/Cmd+P → Quick Open (BH-021).
 *
 * `@replit/codemirror-vim` maps `<C-p>` → `k` (line up) in the default keymap,
 * so with Vim on the workbench never sees Ctrl+P. Capture-phase ownership
 * matches history-keys / BH-003: preventDefault + stop so Vim cannot move, then
 * the note runs host Quick Open (Lumière / VS Code product choice over
 * Obsidian-vim line motion). Suggest's Ctrl+P (move through completions) stays
 * when autocomplete is active (`completionStatus` / tooltip).
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
 * Map a keydown to Ctrl/Cmd+P Quick Open. Physical KeyP (keyCode 80) covers
 * non-Latin layouts the way history-keys covers Z/Y.
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

/** True when CodeMirror autocomplete tooltip is in the document. */
export function suggestTooltipOpen(doc: Document): boolean {
  return !!doc.querySelector(".cm-tooltip-autocomplete");
}

/**
 * Own Mod/Ctrl+P in capture phase so Vim cannot line-up and the shell cannot
 * miss Quick Open. Native fields and an open suggest list keep their shortcuts.
 *
 * `leavesSuggest` should prefer EditorState `completionStatus === "active"` —
 * the tooltip class alone can miss a frame while the list is already interactive.
 */
export function keepQuickOpenKey(
  target: Document,
  onQuickOpen: () => void,
  leavesNative: (target: EventTarget | null) => boolean,
  leavesSuggest: () => boolean = () => suggestTooltipOpen(target),
): () => void {
  const isMac = /Mac|iPhone|iPad/.test(
    target.defaultView?.navigator.platform ?? "",
  );
  const listener = (event: KeyboardEvent) => {
    if (leavesNative(event.target)) {
      return;
    }
    if (leavesSuggest()) {
      return;
    }
    if (!isQuickOpenKey(event, isMac)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onQuickOpen();
  };
  target.addEventListener("keydown", listener, true);
  return () => target.removeEventListener("keydown", listener, true);
}
