import type { EditorState } from "@codemirror/state";
import { lineMarkup } from "../../markdown/list-markup";

/** CommonMark setext underline: optional ≤3 spaces, then === or ---. */
const setextUnderline = /^(?: {0,3})(?:=+|-+)[ \t]*$/u;

function singleEmptyCaret(state: EditorState): boolean {
  const { ranges, main } = state.selection;
  return ranges.length === 1 && main.empty;
}

/**
 * Caret on a setext title or its underline (BH-066).
 * Tab via indentMore would indent only that line and break the heading
 * (title → CodeBlock once indent ≥ 4 / one hard tab).
 */
export function onSetextHeading(state: EditorState): boolean {
  if (!singleEmptyCaret(state)) {
    return false;
  }
  const line = state.doc.lineAt(state.selection.main.head);
  if (setextUnderline.test(line.text)) {
    if (line.number === 1) {
      return false;
    }
    const prev = state.doc.line(line.number - 1);
    if (prev.text.trim() === "" || /^ {0,3}#/.test(prev.text)) {
      return false;
    }
    const { marker, task } = lineMarkup(prev.text);
    return marker === "" && task === "";
  }
  if (line.number >= state.doc.lines) {
    return false;
  }
  const next = state.doc.line(line.number + 1);
  if (!setextUnderline.test(next.text)) {
    return false;
  }
  if (line.text.trim() === "" || /^ {0,3}#/.test(line.text)) {
    return false;
  }
  const { marker, task } = lineMarkup(line.text);
  return marker === "" && task === "";
}
