import type { EditorState, Transaction } from "@codemirror/state";
import { lineMarkup, outerQuotes } from "../../markdown/list-markup";

interface Target {
  state: EditorState;
  dispatch: (tr: Transaction) => void;
}

export function isCalloutOpener(text: string, quotes: string): boolean {
  return /^\[![\w-]+\]/.test(text.slice(quotes.length));
}

/** Quote-prefixed line with no list/task marker. */
export function plainQuoteLine(text: string): boolean {
  const { quotes, marker, task } = lineMarkup(text);
  return marker === "" && task === "" && quotes.includes(">");
}

/** Nest one `> ` level (BH-058). Callout openers no-op. */
export function nestQuote(target: Target): boolean {
  const { state } = target;
  const line = state.doc.lineAt(state.selection.main.head);
  const { quotes } = lineMarkup(line.text);
  if (!quotes.includes(">")) {
    return false;
  }
  if (isCalloutOpener(line.text, quotes)) {
    return true;
  }
  const rest = line.text.slice(quotes.length);
  const insert = quotes + "> " + rest;
  const off = state.selection.main.head - line.from - quotes.length;
  target.dispatch(
    state.update({
      changes: { from: line.from, to: line.to, insert },
      selection: { anchor: line.from + quotes.length + 2 + Math.max(0, off) },
      scrollIntoView: true,
      userEvent: "input.indent",
    }),
  );
  return true;
}

/** Remove one blockquote level (BH-056 / BH-058 Shift+Tab). */
export function unwrapQuote(target: Target): boolean {
  const { state } = target;
  const line = state.doc.lineAt(state.selection.main.head);
  const { quotes } = lineMarkup(line.text);
  if (!quotes.includes(">")) {
    return false;
  }
  const outer = outerQuotes(quotes);
  const rest = line.text.slice(quotes.length);
  const insert = outer + rest;
  target.dispatch(
    state.update({
      changes: { from: line.from, to: line.to, insert },
      selection: { anchor: line.from + outer.length },
      scrollIntoView: true,
      userEvent: "delete.quote",
    }),
  );
  return true;
}

/** Shift+Tab on plain quote: unwrap one level; callout opener no-op (BH-058). */
export function outdentPlainQuote(target: Target): boolean {
  const line = target.state.doc.lineAt(target.state.selection.main.head);
  if (!plainQuoteLine(line.text)) {
    return false;
  }
  const { quotes } = lineMarkup(line.text);
  if (!isCalloutOpener(line.text, quotes)) {
    unwrapQuote(target);
  }
  return true;
}
