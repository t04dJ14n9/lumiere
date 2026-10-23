import type { EditorState } from "@codemirror/state";

/**
 * Optional blockquote markers, then ATX with the required space/tab after
 * `#`…`######` (same opener shape as heading-unwrap / BH-061–063).
 */
const quotedAtx = /^((?:[ \t]*>[ \t]?)*)( {0,3}#{1,6}[ \t]+)/u;

/**
 * Plain ATX heading line: optional ≤3 spaces, then `#`…`######` with the
 * required space/tab (CommonMark). No blockquote / list / task prefix —
 * those keep list Tab (BH-057) or quoted-ATX no-op (BH-070).
 */
const plainAtx = /^ {0,3}#{1,6}[ \t]+/u;

/**
 * Caret on a blockquote-wrapped ATX heading line (BH-070).
 * Tab via nestQuote would add another `>` and change heading depth in the
 * quote stack; treat as a handled no-op (callout-opener Tab parity).
 */
export function onQuotedAtxHeading(state: EditorState): boolean {
  const { ranges, main } = state.selection;
  if (ranges.length !== 1 || !main.empty) {
    return false;
  }
  const text = state.doc.lineAt(main.head).text;
  const match = quotedAtx.exec(text);
  return Boolean(match && (match[1] ?? "").includes(">"));
}

/**
 * Caret on a plain ATX heading line (BH-087).
 * Tab via indentMore indents only that line; with a hard-tab indent unit one
 * Tab turns the heading into a CodeBlock (indent ≥ 4) — same class of break
 * as setext Tab (BH-066).
 */
export function onPlainAtxHeading(state: EditorState): boolean {
  const { ranges, main } = state.selection;
  if (ranges.length !== 1 || !main.empty) {
    return false;
  }
  return plainAtx.test(state.doc.lineAt(main.head).text);
}
