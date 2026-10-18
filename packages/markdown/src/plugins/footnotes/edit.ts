import type { EditorState, TransactionSpec } from "@codemirror/state";
import { footnotes } from "../../markdown/metadata/footnotes";
export function insertFootnote(state: EditorState): TransactionSpec & {
  label: string;
  reference: number;
} {
  const labels = new Set(
    footnotes(state.doc).definitions.map((note) => note.label),
  );
  let number = 1;
  while (labels.has(String(number))) {
    number++;
  }
  // As in Obsidian 1.14: the reference goes before the selection, which
  // stays as it is (a caret after the reference), and the definition at the
  // end of the note, edited in a popover (`definition-popover.ts`).
  const { from, to, empty } = state.selection.main;
  const marker = `[^${number}]`;
  const end = state.doc.length;
  // One blank line before the definition, as Obsidian leaves it.
  const trailing = /\n*$/u.exec(state.sliceDoc(Math.max(0, end - 2), end))![0];
  const definition = `${"\n".repeat(Math.max(0, 2 - trailing.length))}${marker}: `;
  const shift = marker.length;
  return {
    changes: [
      { from, insert: marker },
      { from: end, insert: `${definition}\n` },
    ],
    selection: empty
      ? { anchor: from + shift }
      : { anchor: from + shift, head: to + shift },
    userEvent: "input.footnote",
    label: String(number),
    reference: from + shift,
  };
}
