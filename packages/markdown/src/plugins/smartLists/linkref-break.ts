import { EditorSelection } from "@codemirror/state";
import type { EditorState, Transaction } from "@codemirror/state";
import { lineMarkup } from "../../markdown/list-markup";

interface Target {
  state: EditorState;
  dispatch: (tr: Transaction) => void;
}

/**
 * Shift+Enter inside a link reference definition soft-breaks with a tab body
 * indent (BH-079), matching footnote Shift+Enter (BH-077). Quote prefixes are
 * kept (BH-081: `> [lab]: …` → `> \t…`, footnote BH-080 parity). Footnotes
 * (`[^label]:`) are not claimed — `softBreakFootnoteDefinition` runs first
 * when both are wired. Empty continuations soft-break (do not leave). Empty
 * lines under a def fill the body indent (BH-049 sibling), including
 * quote+tab under a quoted def.
 *
 * Enter continue for link refs is separate (BH-072 / BH-075); this module only
 * owns soft-break so it can land without conflicting with that path.
 */
const quotePrefix = /^((?:[ \t]*>[ \t]?)*)/u;
const linkRefDef = /^ {0,3}\[(?!\^)[^\]]+\]:[ \t]?/u;
const linkRefCont = /^(?: {2,4}| {0,3}\t)/u;

function splitQuotes(text: string): { quotes: string; rest: string } {
  const quotes = quotePrefix.exec(text)?.[1] ?? "";
  return { quotes, rest: text.slice(quotes.length) };
}

export function softBreakLinkReferenceDefinition(target: Target): boolean {
  const { state } = target;
  const range = state.selection.main;
  if (state.selection.ranges.length > 1 || !range.empty) {
    return false;
  }
  const line = state.doc.lineAt(range.head);
  if (line.text === "" && line.number > 1) {
    return fillLinkRefIndent(target, line);
  }
  const { quotes, rest } = splitQuotes(line.text);
  const def = linkRefDef.exec(rest);
  if (def) {
    const markerEnd = line.from + quotes.length + def[0].length;
    if (range.head < markerEnd) {
      return false;
    }
    return splitWithLinkRefIndent(target, line, range.head, quotes + "\t");
  }
  const cont = linkRefCont.exec(rest);
  if (!cont || !underLinkReferenceDefinition(state, line.number)) {
    return false;
  }
  const indent = quotes + cont[0];
  if (range.head < line.from + indent.length) {
    return false;
  }
  const body = rest.slice(cont[0].length);
  if (lineMarkup(indent + body).marker !== "") {
    return false;
  }
  return splitWithLinkRefIndent(target, line, range.head, indent);
}

function fillLinkRefIndent(
  target: Target,
  line: { from: number; to: number; number: number },
): boolean {
  const indent = linkRefFillIndent(target.state, line.number);
  if (indent === null) {
    return false;
  }
  const { state } = target;
  target.dispatch(
    state.update({
      changes: { from: line.from, to: line.to, insert: indent },
      selection: EditorSelection.cursor(line.from + indent.length),
      scrollIntoView: true,
      userEvent: "input",
    }),
  );
  return true;
}

function linkRefFillIndent(
  state: { doc: { line: (n: number) => { text: string } } },
  lineNumber: number,
): string | null {
  for (let n = lineNumber - 1; n >= 1; n--) {
    const text = state.doc.line(n).text;
    const { quotes, rest } = splitQuotes(text);
    if (linkRefDef.test(rest)) {
      return quotes + "\t";
    }
    const cont = linkRefCont.exec(rest);
    if (cont) {
      return quotes + cont[0];
    }
    if (text.trim() === "") {
      continue;
    }
    return null;
  }
  return null;
}

function underLinkReferenceDefinition(
  state: { doc: { line: (n: number) => { text: string } } },
  lineNumber: number,
): boolean {
  for (let n = lineNumber - 1; n >= 1; n--) {
    const text = state.doc.line(n).text;
    const { rest } = splitQuotes(text);
    if (linkRefDef.test(rest)) {
      return true;
    }
    if (linkRefCont.test(rest) || text.trim() === "") {
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
