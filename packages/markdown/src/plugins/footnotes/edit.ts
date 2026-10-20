import type { EditorState, TransactionSpec } from "@codemirror/state";
import { footnotes } from "../../markdown/metadata/footnotes";
import { parseMarkdown } from "../../markdown/dialect";
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
  const { to, empty } = state.selection.main;
  const insertion = referenceInsertion(state);
  const marker = `[^${number}]`;
  const end = state.doc.length;
  // One blank line before the definition, as Obsidian leaves it. Count
  // trailing newlines *after* the reference insertion point: blanks that
  // already sit at EOF stay before an EOF reference, so measuring the whole
  // document end would glue `[^n][^n]:` (or leave only a single newline).
  const afterRef = state.sliceDoc(insertion.from, end);
  const trailing = /\n*$/u.exec(afterRef)![0];
  const definition = `${"\n".repeat(Math.max(0, 2 - trailing.length))}${marker}: `;
  const reference = insertion.from + insertion.prefix.length + marker.length;
  return {
    changes: [
      { from: insertion.from, insert: insertion.prefix + marker },
      { from: end, insert: `${definition}\n` },
    ],
    selection:
      empty || insertion.prefix.length > 0
        ? { anchor: reference }
        : { anchor: reference, head: to + marker.length },
    userEvent: "input.footnote",
    label: String(number),
    reference,
  };
}

function referenceInsertion(state: EditorState) {
  const line = state.doc.lineAt(state.selection.main.from);
  let headingEnd: number | undefined;
  // A reference before an ATX marker or on a Setext underline destroys the
  // heading. Use the parsed block so code containing `#` is left alone.
  parseMarkdown(state.doc).iterate({
    from: line.from,
    to: line.to,
    enter(node) {
      if (/^(ATX|Setext)Heading[1-6]$/.test(node.name)) {
        headingEnd = state.doc.lineAt(node.to).to;
        return false;
      }
      return undefined;
    },
  });
  return headingEnd === undefined
    ? { from: state.selection.main.from, prefix: "" }
    : { from: headingEnd, prefix: "\n\n" };
}
