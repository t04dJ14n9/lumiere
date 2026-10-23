import type { EditorState } from "@codemirror/state";

import { lineMarkup } from "../../markdown/list-markup";

/** CommonMark setext underline body after quote prefixes are stripped. */
const setextUnderline = /^(?: {0,3})(?:=+|-+)[ \t]*$/u;

function singleEmptyCaret(state: EditorState): boolean {
  const { ranges, main } = state.selection;
  return ranges.length === 1 && main.empty;
}

/** Strip one run of `>` quote markers; return null when the line is not quoted. */
function afterQuotes(text: string): { quotes: string; rest: string } | null {
  const { quotes, marker, task } = lineMarkup(text);
  if (!quotes.includes(">") || marker !== "" || task !== "") {
    return null;
  }
  return { quotes, rest: text.slice(quotes.length) };
}

/**
 * Caret on a blockquote-wrapped setext title or underline (BH-068).
 * Tab via nestQuote would add another `>` on only one line and break the
 * heading; Backspace via unwrapQuote would drop `>` from the title alone.
 */
export function onQuotedSetextHeading(state: EditorState): boolean {
  if (!singleEmptyCaret(state)) {
    return false;
  }
  const line = state.doc.lineAt(state.selection.main.head);
  const here = afterQuotes(line.text);
  if (!here) {
    return false;
  }
  if (setextUnderline.test(here.rest)) {
    if (line.number === 1) {
      return false;
    }
    const prev = afterQuotes(state.doc.line(line.number - 1).text);
    if (!prev || prev.quotes !== here.quotes) {
      return false;
    }
    if (prev.rest.trim() === "" || /^ {0,3}#/.test(prev.rest)) {
      return false;
    }
    return !setextUnderline.test(prev.rest);
  }
  if (line.number >= state.doc.lines) {
    return false;
  }
  if (here.rest.trim() === "" || /^ {0,3}#/.test(here.rest)) {
    return false;
  }
  const next = afterQuotes(state.doc.line(line.number + 1).text);
  if (!next || next.quotes !== here.quotes) {
    return false;
  }
  return setextUnderline.test(next.rest);
}

/** Text-start Backspace/Shift+Tab: do not unwrap one `>` on a quoted setext. */
export function refuseQuotedSetextUnwrap(
  state: EditorState,
  quotes: string,
): boolean {
  return quotes.includes(">") && onQuotedSetextHeading(state);
}
