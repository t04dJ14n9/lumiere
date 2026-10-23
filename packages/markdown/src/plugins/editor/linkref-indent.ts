import type { EditorState } from "@codemirror/state";

/**
 * Optional blockquote prefix, then a CommonMark link reference definition
 * opener (`[label]: …`) — not a footnote (`[^label]:`). Label cannot contain
 * `]` or newlines; destination must begin on the same line after whitespace.
 */
const quotedLinkRef =
  /^((?:[ \t]*>[ \t]?)*)( {0,3}\[(?!\^)[^\]\n]+\]:[ \t]+\S)/u;

/**
 * Caret on a link reference definition line (BH-069).
 * Tab via indentMore / nestQuote would indent or nest only that line and
 * turn the definition into a CodeBlock or break the quote (same class as
 * footnote-def Tab / BH-067).
 */
export function onLinkReferenceDefinitionLine(state: EditorState): boolean {
  const { ranges, main } = state.selection;
  if (ranges.length !== 1 || !main.empty) {
    return false;
  }
  return quotedLinkRef.test(state.doc.lineAt(main.head).text);
}
