import type { EditorState, TransactionSpec } from "@codemirror/state";
export function isCallout(source: string): boolean { return /^\s*>\s*\[![\w-]+\]/.test(source); }
export function insertCallout(state: EditorState): TransactionSpec {
  const { from, to } = state.selection.main;
  const prefix = from > 0 && state.sliceDoc(from - 1, from) !== "\n" ? "\n" : "";
  const content = state.sliceDoc(from, to).split("\n").map((line) => `> ${line}`).join("\n");
  const insert = `${prefix}> [!note]\n${content}\n`;
  return { changes: { from, to, insert }, selection: { anchor: from + prefix.length + 12 }, userEvent: "input.callout" };
}
