import type { CaretMode } from "../editor/api";

interface VimCaretState {
  overwrite?: boolean;
  vim?: {
    insertMode?: boolean;
    visualMode?: boolean;
    expectLiteralNext?: boolean;
    inputState?: { keyBuffer?: readonly string[] };
  } | null;
}

/** R is insert+overwrite; r waits for a literal without entering insert mode. */
export function vimCaretMode(state?: VimCaretState): CaretMode {
  const vim = state?.vim;
  if (!vim) {
    return "typing";
  }
  if (vim.insertMode) {
    return state?.overwrite ? "replace" : "insert";
  }
  const keys = vim.inputState?.keyBuffer?.join("") ?? "";
  if (vim.expectLiteralNext && /^\d*r$/.test(keys)) {
    return "replace";
  }
  return vim.visualMode ? "visual" : "normal";
}
