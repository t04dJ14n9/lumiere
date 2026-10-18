import type { EditorState, TransactionSpec } from "@codemirror/state";
export function isCallout(source: string): boolean {
  return /^\s*>\s*\[![\w-]+\]/.test(source);
}
/**
 * Insert Callout, as in Obsidian: the selected lines go into a note callout,
 * with a blank line between it and any text above or below; on an empty
 * line, a callout with a title and contents to replace. Its type is selected.
 * A selection ending at column zero does not include that line.
 */
export function insertCallout(state: EditorState): TransactionSpec {
  const { from, to, empty } = state.selection.main;
  const first = state.doc.lineAt(from);
  const last = state.doc.lineAt(empty ? to : Math.max(from, to - 1));
  const text = state.sliceDoc(first.from, last.to);
  const touches = (n: number) =>
    n >= 1 && n <= state.doc.lines && state.doc.line(n).text.trim() !== "";
  const [before, body, after] = text.trim()
    ? [
        touches(first.number - 1) ? "\n" : "",
        `> [!NOTE]\n${text
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n")}`,
        touches(last.number + 1) ? "\n" : "",
      ]
    : ["\n", "> [!NOTE] Title\n> Contents", "\n"];
  const type = first.from + before.length + "> [!".length;
  return {
    changes: { from: first.from, to: last.to, insert: before + body + after },
    selection: { anchor: type, head: type + "NOTE".length },
    userEvent: "input.callout",
  };
}
