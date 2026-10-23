import { EditorSelection } from "@codemirror/state";
import type { EditorState, Transaction } from "@codemirror/state";
import { lineMarkup } from "../../markdown/list-markup";

interface Target {
  state: EditorState;
  dispatch: (tr: Transaction) => void;
}

/**
 * Enter on a link reference definition (or its indented continuation)
 * continues with a tab-indented line (BH-072), matching footnote-def Enter
 * (BH-060). Empty continuation leaves. Footnotes (`[^label]:`) are not
 * claimed — `continueFootnoteDefinition` runs first.
 */
const linkRefDef = /^ {0,3}\[(?!\^)[^\]]+\]:[ \t]?/u;
const linkRefCont = /^(?: {2,4}| {0,3}\t)/u;

export function continueLinkReferenceDefinition(target: Target): boolean {
  const { state } = target;
  const range = state.selection.main;
  const line = state.doc.lineAt(range.head);
  const def = linkRefDef.exec(line.text);
  if (def) {
    const markerEnd = line.from + def[0].length;
    if (range.head < markerEnd) {
      return false;
    }
    return splitWithLinkRefIndent(target, line, range.head, "\t");
  }
  if (
    !linkRefCont.test(line.text) ||
    !underLinkReferenceDefinition(state, line.number)
  ) {
    return false;
  }
  const indent = linkRefCont.exec(line.text)![0];
  if (range.head < line.from + indent.length) {
    return false;
  }
  const body = line.text.slice(indent.length);
  if (lineMarkup(indent + body).marker !== "") {
    return false;
  }
  if (body.trim() === "") {
    return leaveLinkRefContinuation(target, line);
  }
  return splitWithLinkRefIndent(target, line, range.head, indent);
}

function underLinkReferenceDefinition(
  state: { doc: { line: (n: number) => { text: string } } },
  lineNumber: number,
): boolean {
  for (let n = lineNumber - 1; n >= 1; n--) {
    const text = state.doc.line(n).text;
    if (linkRefDef.test(text)) {
      return true;
    }
    if (linkRefCont.test(text) || text.trim() === "") {
      continue;
    }
    return false;
  }
  return false;
}

function splitWithLinkRefIndent(
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

function leaveLinkRefContinuation(
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
