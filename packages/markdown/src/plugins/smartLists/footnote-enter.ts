import { EditorSelection } from "@codemirror/state";
import type { EditorState, Transaction } from "@codemirror/state";
import { lineMarkup } from "../../markdown/list-markup";

interface Target {
  state: EditorState;
  dispatch: (tr: Transaction) => void;
}

/**
 * Enter on a footnote definition (or its indented continuation) continues
 * with a tab-indented line, as Obsidian and the footnote popover write it
 * (BH-060). An empty continuation line steps out of the definition.
 *
 * Continuation indent alone is not enough: list nests also start with 2–4
 * spaces, so only lines under a `[^label]:` definition are claimed. List
 * markers under a footnote fall through to smart-list continue.
 */
const footnoteDef = /^ {0,3}\[\^[^\]]+\]:[ \t]?/u;
const footnoteCont = /^(?: {2,4}| {0,3}\t)/u;

export function continueFootnoteDefinition(target: Target): boolean {
  const { state } = target;
  const range = state.selection.main;
  const line = state.doc.lineAt(range.head);
  const def = footnoteDef.exec(line.text);
  if (def) {
    const markerEnd = line.from + def[0].length;
    if (range.head < markerEnd) {
      return false;
    }
    return splitWithFootnoteIndent(target, line, range.head, "\t");
  }
  if (
    !footnoteCont.test(line.text) ||
    !underFootnoteDefinition(state, line.number)
  ) {
    return false;
  }
  const indent = footnoteCont.exec(line.text)![0];
  if (range.head < line.from + indent.length) {
    return false;
  }
  const body = line.text.slice(indent.length);
  // Lists nested under a footnote keep smart-list Enter / outdent.
  if (lineMarkup(indent + body).marker !== "") {
    return false;
  }
  if (body.trim() === "") {
    return leaveFootnoteContinuation(target, line);
  }
  return splitWithFootnoteIndent(target, line, range.head, indent);
}

/** Whether `lineNumber` sits in a footnote definition's indented body. */
function underFootnoteDefinition(
  state: { doc: { line: (n: number) => { text: string } } },
  lineNumber: number,
): boolean {
  for (let n = lineNumber - 1; n >= 1; n--) {
    const text = state.doc.line(n).text;
    if (footnoteDef.test(text)) {
      return true;
    }
    if (footnoteCont.test(text) || text.trim() === "") {
      continue;
    }
    return false;
  }
  return false;
}

function splitWithFootnoteIndent(
  target: Target,
  line: { from: number; to: number },
  head: number,
  indent: string,
): boolean {
  const { state } = target;
  const after = state.doc.sliceString(head, line.to);
  const insert = state.lineBreak + indent + after;
  target.dispatch(
    state.update({
      changes: { from: head, to: line.to, insert },
      selection: EditorSelection.cursor(
        head + state.lineBreak.length + indent.length,
      ),
      scrollIntoView: true,
      userEvent: "input",
    }),
  );
  return true;
}

/** Enter on an empty indented footnote line leaves the definition. */
function leaveFootnoteContinuation(
  target: Target,
  line: { from: number; to: number },
): boolean {
  const { state } = target;
  target.dispatch(
    state.update({
      changes: { from: line.from, to: line.to, insert: "" },
      selection: EditorSelection.cursor(line.from),
      scrollIntoView: true,
      userEvent: "input",
    }),
  );
  return true;
}
