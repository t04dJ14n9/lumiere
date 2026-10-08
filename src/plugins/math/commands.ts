import type { EditorState, TransactionSpec } from "@codemirror/state";
export function mathEdit(state: EditorState, block: boolean): TransactionSpec {
  const { from, to } = state.selection.main;
  const selected = state.sliceDoc(from, to);
  if (!block && from > 0 && state.sliceDoc(from - 1, from) === "$" && state.sliceDoc(to, to + 1) === "$") {
    return { changes: [{ from: from - 1, to: from, insert: "" }, { from: to, to: to + 1, insert: "" }],
      selection: { anchor: from - 1, head: to - 1 }, userEvent: "input.math" };
  }
  const before = block ? (from && state.sliceDoc(from - 1, from) !== "\n" ? "\n$$\n" : "$$\n") : "$";
  const after = block ? "\n$$\n" : "$";
  return { changes: { from, to, insert: before + selected + after },
    selection: { anchor: from + before.length, head: from + before.length + selected.length }, userEvent: "input.math" };
}
