import type { EditorState } from "@codemirror/state";

/**
 * Plain thematic break (HorizontalRule): ≤3 spaces, then 3+ of the same
 * `*` / `-` / `_` with optional spaces between (CommonMark). No quote /
 * list prefix — those keep quote-nest / list Tab.
 */
const thematicBreak = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/u;

/**
 * Caret on a plain thematic-break line (BH-088).
 * Tab via indentMore with a hard-tab unit turns `---` / `***` / `___` into a
 * CodeBlock (indent ≥ 4), same class of break as setext/ATX Tab (BH-066/087).
 * Setext underlines (`Title\n---`) are handled first by `onSetextHeading`.
 */
export function onThematicBreak(state: EditorState): boolean {
  const { ranges, main } = state.selection;
  if (ranges.length !== 1 || !main.empty) {
    return false;
  }
  return thematicBreak.test(state.doc.lineAt(main.head).text);
}

/**
 * Optional blockquote markers, then thematic break: ≤3 spaces, then 3+ of
 * the same `*` / `-` / `_` with optional spaces between (CommonMark).
 */
const quotedThematic =
  /^((?:[ \t]*>[ \t]?)*)( {0,3}([-*_])(?:[ \t]*\3){2,}[ \t]*)$/u;

/**
 * Caret on a blockquote-wrapped thematic-break line (BH-096).
 * Tab via nestQuote nests another `>` (`> ---` → `> > ---`); Tab via list
 * reindent on spaced marks (`> - - -` → `>   - - -`). Both destroy the HR.
 * No-op before list / nestQuote. Plain HRs are BH-088 (#370).
 */
export function onQuotedThematicBreak(state: EditorState): boolean {
  const { ranges, main } = state.selection;
  if (ranges.length !== 1 || !main.empty) {
    return false;
  }
  const text = state.doc.lineAt(main.head).text;
  const match = quotedThematic.exec(text);
  return Boolean(match && (match[1] ?? "").includes(">"));
}
