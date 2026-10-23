import type { EditorState } from "@codemirror/state";

/**
 * Optional blockquote markers, then ATX with the required space/tab after
 * `#`…`######` (same opener shape as heading-unwrap / BH-061–063).
 */
const quotedAtx =
  /^((?:[ \t]*>[ \t]?)*)( {0,3}#{1,6}[ \t]+)/u;

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
