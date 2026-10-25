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
 * (BH-060). Quote prefixes are kept (BH-075: `> [lab]: …` → `> \t…`). Empty
 * continuation leaves. Footnotes (`[^label]:`) are not claimed —
 * `continueFootnoteDefinition` runs first.
 */
const quotePrefix = /^((?:[ \t]*>[ \t]?)*)/u;
const linkRefMarker = /^ {0,3}\[(?!\^)[^\]]+\]:[ \t]?/u;
const linkRefCont = /^(?: {2,4}| {0,3}\t)/u;
/**
 * Optional quotes, then link-reference marker `[label]:` (not footnote
 * `[^label]:`). Trailing spaces after `:` are part of the marker so an
 * all-whitespace destination still counts as empty (BH-092).
 */
const emptyLinkRefDef =
  /^((?:[ \t]*>[ \t]?)*)( {0,3}\[(?!\^)[^\]]+\]:[ \t]*)\s*$/u;

function splitQuotes(text: string): { quotes: string; rest: string } {
  const quotes = quotePrefix.exec(text)?.[1] ?? "";
  return { quotes, rest: text.slice(quotes.length) };
}

export function continueLinkReferenceDefinition(target: Target): boolean {
  if (unwrapEmptyLinkReferenceDefinition(target)) {
    return true;
  }
  const { state } = target;
  const range = state.selection.main;
  const line = state.doc.lineAt(range.head);
  const { quotes, rest } = splitQuotes(line.text);
  const def = linkRefMarker.exec(rest);
  if (def) {
    const markerEnd = line.from + quotes.length + def[0].length;
    if (range.head < markerEnd) {
      return false;
    }
    return splitWithLinkRefIndent(target, line, range.head, quotes + "\t");
  }
  return continueLinkRefBody(target, line, range.head, { quotes, rest });
}

/** Indented body under a link-ref def (plain or quoted); empty leaves. */
function continueLinkRefBody(
  target: Target,
  line: { from: number; to: number; number: number; text: string },
  head: number,
  parts: { quotes: string; rest: string },
): boolean {
  const cont = linkRefCont.exec(parts.rest);
  if (!cont || !underLinkReferenceDefinition(target.state, line.number)) {
    return false;
  }
  const indent = parts.quotes + cont[0];
  if (head < line.from + indent.length) {
    return false;
  }
  const body = parts.rest.slice(cont[0].length);
  if (lineMarkup(indent + body).marker !== "") {
    return false;
  }
  if (body.trim() === "") {
    return leaveLinkRefContinuation(target, line);
  }
  return splitWithLinkRefIndent(target, line, head, indent);
}

function underLinkReferenceDefinition(
  state: { doc: { line: (n: number) => { text: string } } },
  lineNumber: number,
): boolean {
  for (let n = lineNumber - 1; n >= 1; n--) {
    const text = state.doc.line(n).text;
    const { rest } = splitQuotes(text);
    if (linkRefMarker.test(rest)) {
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

/**
 * Enter / Shift+Enter on an empty link reference definition unwraps
 * `[label]: ` (BH-092 / footnote empty Enter BH-091 / ATX BH-084 / callout
 * BH-086 parity). Keeps quote prefixes (`> [label]: |` → `> |`). Non-empty
 * defs and mid-marker carets fall through (BH-072 continue is separate).
 */
export function unwrapEmptyLinkReferenceDefinition(target: Target): boolean {
  const { state } = target;
  const range = state.selection.main;
  if (state.selection.ranges.length > 1 || !range.empty) {
    return false;
  }
  const line = state.doc.lineAt(range.head);
  const match = emptyLinkRefDef.exec(line.text);
  if (!match) {
    return false;
  }
  const quotes = match[1] ?? "";
  const marker = match[2] ?? "";
  if (marker.length === 0) {
    return false;
  }
  const markerFrom = line.from + quotes.length;
  const markerTo = markerFrom + marker.length;
  if (range.head < markerTo) {
    return false;
  }
  target.dispatch(
    state.update({
      changes: { from: markerFrom, to: line.to, insert: "" },
      selection: EditorSelection.cursor(markerFrom),
      scrollIntoView: true,
      userEvent: "input",
    }),
  );
  return true;
}
