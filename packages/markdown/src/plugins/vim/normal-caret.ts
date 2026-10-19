import { Transaction, type EditorState } from "@codemirror/state";
import { ViewPlugin, type EditorView } from "@codemirror/view";
import { getCM } from "@replit/codemirror-vim";

interface VimMode {
  insertMode?: boolean;
  visualMode?: boolean;
}

/**
 * Where Vim's normal-mode caret belongs, if it is not there: on a line's
 * last character, never after it (an empty line keeps its only place).
 */
export function normalCaretOnText(
  state: EditorState,
  vim: VimMode | undefined,
): number | undefined {
  const { main, ranges } = state.selection;
  if (!vim || vim.insertMode || vim.visualMode) {
    return undefined;
  }
  if (!main.empty || ranges.length > 1) {
    return undefined;
  }
  const line = state.doc.lineAt(main.head);
  return main.head === line.to && line.length > 0 ? line.to - 1 : undefined;
}

function placeNormalCaret(view: EditorView): void {
  const cm = getCM(view);
  const at = normalCaretOnText(view.state, cm?.state.vim ?? undefined);
  if (cm && at !== undefined) {
    const line = view.state.doc.lineAt(at);
    cm.setCursor({ line: line.number - 1, ch: at - line.from });
  }
}

/**
 * Edits applied from the host map the caret, and can leave it after a line's
 * end: `u` runs the note's native undo, which removes the text the caret sat
 * after. Vim's own undo puts the caret back on the line's last character, as
 * Obsidian's does; so does this, after any host edit in normal mode.
 */
export const normalCaretAfterHostEdits = ViewPlugin.define((view) => ({
  update(update) {
    if (update.transactions.some((tr) => tr.annotation(Transaction.remote))) {
      // CodeMirror forbids dispatching during an update.
      queueMicrotask(() => placeNormalCaret(view));
    }
  },
}));
