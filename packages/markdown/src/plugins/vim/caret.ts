import type { CaretMode } from "../editor/api";

interface VimCaretState {
  overwrite?: boolean;
  vim?: {
    insertMode?: boolean;
    visualMode?: boolean;
    inputState?: { operator?: string | null | undefined };
  } | null;
}

/**
 * The caret VSCodeVim shows for the library's state. R is insert plus
 * overwrite. A search or ex prompt (`prompt`) and an operator waiting for its
 * motion (`pending`) have their own carets; a pending `r` (or `f`, a count, a
 * register) keeps the normal block, as VSCodeVim does.
 */
export function vimCaretMode(
  state?: VimCaretState,
  promptOpen = false,
): CaretMode {
  const vim = state?.vim;
  if (!vim) {
    return "typing";
  }
  if (vim.insertMode) {
    return state?.overwrite ? "replace" : "insert";
  }
  if (promptOpen) {
    return "prompt";
  }
  if (vim.visualMode) {
    return "visual";
  }
  return vim.inputState?.operator ? "pending" : "normal";
}
