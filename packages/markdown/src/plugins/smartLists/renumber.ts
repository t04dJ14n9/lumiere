import {
  EditorState,
  type Transaction,
  type TransactionSpec,
} from "@codemirror/state";
import { renumberRuns } from "../../markdown/ordered-lists";

/** Edits this large are left alone: numbering is for typing, not imports. */
const MAX_LINES = 200;

/**
 * As in Obsidian, an edit inside an ordered list numbers the list again
 * (`1. 1. 1.` becomes `1. 2. 3.`), in the same undo step. Opening a note, or
 * editing elsewhere, leaves its numbers as they are.
 */
export const renumberOnEdit = EditorState.transactionFilter.of((tr) => {
  if (
    !tr.docChanged ||
    !(
      tr.isUserEvent("input") ||
      tr.isUserEvent("delete") ||
      tr.isUserEvent("move")
    )
  ) {
    return tr;
  }
  const changes = renumberRuns(
    tr.newDoc,
    changedLines(tr),
    tr.startState.tabSize,
  );
  return changes.length
    ? [tr, { changes, sequential: true } satisfies TransactionSpec]
    : tr;
});

/** The lines an edit touched, and the lines next to them, in the new note. */
function changedLines(tr: Transaction): Set<number> {
  const lines = new Set<number>();
  tr.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
    const first = tr.newDoc.lineAt(fromB).number;
    const last = tr.newDoc.lineAt(toB).number;
    for (let n = first - 1; n <= Math.min(last + 1, first + MAX_LINES); n++) {
      lines.add(n);
    }
  });
  return lines;
}
