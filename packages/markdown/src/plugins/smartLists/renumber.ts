import {
  EditorState,
  type Transaction,
  type TransactionSpec,
} from "@codemirror/state";
import { orderedRun, renumberRuns } from "../../markdown/ordered-lists";

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
    { kept: keptStarts(tr) },
  );
  return changes.length
    ? [tr, { changes, sequential: true } satisfies TransactionSpec]
    : tr;
});

/**
 * A list whose first items an edit deleted keeps counting from where it
 * started, as in Obsidian 1.14.4 (measured: deleting `1. a` from `1. 2. 3.`
 * leaves `1. b`, from `3. 4. 5.` leaves `3. b`): the first surviving item's
 * new line, with the number the list started at.
 */
function keptStarts(tr: Transaction): Map<number, number> {
  const old = tr.startState.doc;
  const kept = new Map<number, number>();
  tr.changes.iterChangedRanges((fromA, toA) => {
    const run = orderedRun(
      old,
      old.lineAt(fromA).number,
      tr.startState.tabSize,
    );
    const head = run[0];
    if (!head || old.line(head.line).from < fromA) {
      return;
    }
    const survivor = run.find((item) => old.line(item.line).from >= toA);
    if (survivor) {
      const at = tr.changes.mapPos(old.line(survivor.line).from);
      kept.set(tr.newDoc.lineAt(at).number, head.number);
    }
  });
  return kept;
}

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
