import type { EditorState, TransactionSpec } from "@codemirror/state";
import { footnotes } from "../../markdown/metadata/footnotes";
export function insertFootnote(state: EditorState): TransactionSpec {
  const labels = new Set(footnotes(state.doc).definitions.map((note) => note.label));
  let number = 1;
  while (labels.has(String(number))) number++;
  const { from, to } = state.selection.main;
  const selected = state.sliceDoc(from, to);
  const marker = `[^${number}]`;
  const tail = `\n\n${marker}: ${selected}`;
  const changes = from === state.doc.length
    ? [{ from, to, insert: marker + tail }]
    : [{ from, to, insert: marker }, { from: state.doc.length, insert: tail }];
  const anchor = state.doc.length - (to - from) + marker.length + tail.length;
  return { changes, selection: { anchor }, userEvent: "input.footnote" };
}
