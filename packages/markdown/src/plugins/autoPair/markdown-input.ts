import {
  EditorSelection,
  Prec,
  type EditorState,
  type Extension,
  type TransactionSpec,
} from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { continuationPrefix } from "../../markdown/list-markup";

/**
 * Markdown pairing that CodeMirror's bracket closing cannot express, as
 * Obsidian's Auto pair Markdown syntax does it.
 */

/** Characters that wrap a selection, but insert alone without one. */
export const WRAP_ONLY: readonly string[] = ["=", "~", "$", "%"];

/** Typing one of `WRAP_ONLY` over selections wraps each, keeping it selected. */
export function wrapOnly(
  state: EditorState,
  text: string,
): TransactionSpec | undefined {
  const { ranges } = state.selection;
  if (!WRAP_ONLY.includes(text) || ranges.some((range) => range.empty)) {
    return undefined;
  }
  return {
    ...state.changeByRange((range) => ({
      changes: [
        { from: range.from, insert: text },
        { from: range.to, insert: text },
      ],
      range: EditorSelection.range(range.anchor + 1, range.head + 1),
    })),
    userEvent: "input.type",
  };
}

/**
 * The third backtick opens a code fence and closes it on the next line,
 * which keeps the line's quotes and list indentation. Backticks after the
 * third are typed as they are.
 */
export function completeFence(
  state: EditorState,
  text: string,
): TransactionSpec | undefined {
  const { ranges, main } = state.selection;
  if (text !== "`" || ranges.length > 1 || !main.empty) {
    return undefined;
  }
  const line = state.doc.lineAt(main.head);
  const before = line.text.slice(0, main.head - line.from);
  const ticks = /`*$/u.exec(before)![0].length;
  if (ticks < 2) {
    return undefined;
  }
  const close =
    ticks === 2 ? state.lineBreak + continuationPrefix(line.text) + "```" : "";
  return {
    changes: { from: main.head, insert: "`" + close },
    selection: EditorSelection.cursor(main.head + 1),
    userEvent: "input.type",
  };
}

/** Runs before CodeMirror's bracket closing, which would pair these. */
export const markdownInput: Extension = Prec.high(
  EditorView.inputHandler.of((view, from, to, text) => {
    const { state } = view;
    const main = state.selection.main;
    if (view.composing || from !== main.from || to !== main.to) {
      return false;
    }
    const spec = wrapOnly(state, text) ?? completeFence(state, text);
    if (!spec) {
      return false;
    }
    view.dispatch(spec);
    return true;
  }),
);
