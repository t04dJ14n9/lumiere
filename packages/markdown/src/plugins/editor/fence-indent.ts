import type { EditorState } from "@codemirror/state";

/**
 * Plain fenced code opener/closer: ≤3 spaces, then 3+ backticks or tildes,
 * optional info string (CommonMark). No quote / list prefix.
 */
const fenceLine = /^ {0,3}(`{3,}|~{3,})[^`]*$/u;

/**
 * Caret on a plain fence opener/closer line (BH-089).
 * Tab via indentMore with a hard-tab unit indents the fence (≥4) so it is no
 * longer a fence — same class of break as HR/setext/ATX Tab (BH-088/066/087).
 */
export function onFenceLine(state: EditorState): boolean {
  const { ranges, main } = state.selection;
  if (ranges.length !== 1 || !main.empty) {
    return false;
  }
  return fenceLine.test(state.doc.lineAt(main.head).text);
}
