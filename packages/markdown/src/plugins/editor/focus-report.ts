/**
 * Reports whether the note's webview has keyboard focus, for the
 * `lumiere.markdown.editorFocus` context key that scopes the note's
 * keybindings. VS Code's `activeCustomEditorId` stays set while focus is in
 * the Explorer, a chat or a panel, and an extension keybinding outranks the
 * built-in one for the same key: without this key, Cmd+B there would bold
 * the note instead of toggling the sidebar, and Cmd+K would swallow every
 * Cmd+K chord. The window's focus covers every input in the note (table
 * cells, properties, the find bar), not only CodeMirror.
 */
export function reportWebviewFocus(
  target: Window,
  report: (hasFocus: boolean) => void,
): () => void {
  const focus = () => report(true);
  const blur = () => report(false);
  target.addEventListener("focus", focus);
  target.addEventListener("blur", blur);
  report(target.document.hasFocus());
  return () => {
    target.removeEventListener("focus", focus);
    target.removeEventListener("blur", blur);
  };
}
