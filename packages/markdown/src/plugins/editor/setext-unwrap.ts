import type { EditorState, Transaction } from "@codemirror/state";

interface Target {
  state: EditorState;
  dispatch: (tr: Transaction) => void;
}

/**
 * Optional blockquote prefix, then a setext underline (`===` / `---`) alone on
 * the line. Title is the previous line with the same quote prefix.
 */
const setextUnderline = /^((?:[ \t]*>[ \t]?)*)(=+|-+)[ \t]*$/u;
const quotePrefix = /^((?:[ \t]*>[ \t]?)*)/u;

/**
 * Backspace at the start of a setext underline unwraps the heading by deleting
 * the underline (BH-074). `Title\n|===` → `Title|`; quotes kept
 * (`> Title\n> |===` → `> Title|`). Mid-underline Backspace falls through.
 * Mismatched quote depth vs the title line is left alone.
 */
export function unwrapSetextUnderline(target: Target): boolean {
  const { state } = target;
  const range = state.selection.main;
  if (state.selection.ranges.length > 1 || !range.empty) {
    return false;
  }
  const line = state.doc.lineAt(range.head);
  const match = setextUnderline.exec(line.text);
  if (!match || line.number < 2) {
    return false;
  }
  const quotes = match[1] ?? "";
  if (range.head !== line.from + quotes.length) {
    return false;
  }
  const title = state.doc.line(line.number - 1);
  const titleQuotes = quotePrefix.exec(title.text)?.[1] ?? "";
  if (titleQuotes !== quotes) {
    return false;
  }
  const titleRest = title.text.slice(quotes.length);
  if (titleRest.trim() === "" || /^(?:=+|-+)[ \t]*$/u.test(titleRest)) {
    return false;
  }
  target.dispatch(
    state.update({
      changes: { from: title.to, to: line.to, insert: "" },
      selection: { anchor: title.to },
      scrollIntoView: true,
      userEvent: "delete.setext",
    }),
  );
  return true;
}
