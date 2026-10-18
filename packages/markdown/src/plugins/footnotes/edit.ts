import type { EditorState, TransactionSpec } from "@codemirror/state";
import { footnotes } from "../../markdown/metadata/footnotes";
export function insertFootnote(state: EditorState): TransactionSpec {
  const labels = new Set(
    footnotes(state.doc).definitions.map((note) => note.label),
  );
  let number = 1;
  while (labels.has(String(number))) {
    number++;
  }
  // As in Obsidian: the reference goes before the selection, which stays as
  // it is, and the definition at the end of the note. Obsidian edits the
  // definition in a popover; here the caret goes to it.
  const { from } = state.selection.main;
  const marker = `[^${number}]`;
  const definition = `\n\n${marker}: `;
  const end = state.doc.length;
  return {
    changes: [
      { from, insert: marker },
      { from: end, insert: `${definition}\n` },
    ],
    selection: { anchor: end + marker.length + definition.length },
    userEvent: "input.footnote",
  };
}
