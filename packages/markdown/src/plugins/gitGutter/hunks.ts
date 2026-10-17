import { StateEffect, StateField } from "@codemirror/state";
import type { EditorState, Text } from "@codemirror/state";
import { lineHunks } from "../../shared/diff";
import type { DocHunk, HunkSet } from "./api";

export const setHunks = StateEffect.define<readonly DocHunk[]>();

export const hunkField = StateField.define<HunkSet>({
  create: () => ({ hunks: [], generation: 0 }),
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setHunks)) {
        return { hunks: effect.value, generation: value.generation + 1 };
      }
    }
    if (!tr.docChanged || value.hunks.length === 0) {
      return value;
    }
    // Keep bars beside their text until the debounced recompute lands.
    const hunks = value.hunks.map((hunk) => {
      const from = tr.changes.mapPos(hunk.from, -1);
      const to = Math.max(from, tr.changes.mapPos(hunk.to, 1));
      return { ...hunk, from, to: hunk.kind === "deleted" ? from : to };
    });
    return { hunks, generation: value.generation };
  },
});

/** The hunks from `baseline` to `doc`, in document offsets. */
export function computeHunks(baseline: string, doc: Text): DocHunk[] {
  const baseLines = baseline.split("\n");
  return lineHunks(baseline, doc.toString()).map((hunk) => {
    const old = baseLines.slice(hunk.oldFrom, hunk.oldTo).join("\n");
    if (hunk.kind === "deleted") {
      const atEnd = hunk.newFrom >= doc.lines;
      const from = atEnd ? doc.length : doc.line(hunk.newFrom + 1).from;
      return {
        kind: "deleted",
        from,
        to: from,
        old,
        oldLine: hunk.oldFrom + 1,
        atEnd,
      };
    }
    return {
      kind: hunk.kind,
      from: doc.line(hunk.newFrom + 1).from,
      to: doc.line(hunk.newTo).to,
      old,
      oldLine: hunk.oldFrom + 1,
      atEnd: false,
    };
  });
}

/**
 * The fresh hunk an older one (a mapped bar, a widget's copy) stands for. The
 * identity is the baseline side: same kind, baseline text and baseline line.
 * The fresh hunk must also overlap the held one and be no wider than it, so a
 * re-diff that realigns the baseline or widens the change (taking unrelated
 * edits with it) never becomes the target of a destructive action. Undefined
 * when the change is gone or no longer recognisable: the caller does nothing.
 */
export function resolveHunk(
  fresh: readonly DocHunk[],
  hunk: DocHunk,
): DocHunk | undefined {
  const matches = fresh.filter(
    (candidate) =>
      candidate.kind === hunk.kind &&
      candidate.old === hunk.old &&
      candidate.oldLine === hunk.oldLine &&
      candidate.atEnd === hunk.atEnd &&
      candidate.from <= hunk.to &&
      candidate.to >= hunk.from &&
      candidate.to - candidate.from <= hunk.to - hunk.from,
  );
  return matches.length === 1 ? matches[0] : undefined;
}

/** The edit that puts a hunk's baseline text back. */
export interface RevertEdit {
  readonly from: number;
  readonly to?: number;
  readonly insert?: string;
}

export function revertChange(state: EditorState, hunk: DocHunk): RevertEdit {
  const doc = state.doc;
  if (hunk.kind === "modified") {
    return { from: hunk.from, to: hunk.to, insert: hunk.old };
  }
  if (hunk.kind === "added") {
    return hunk.to < doc.length
      ? { from: hunk.from, to: hunk.to + 1 }
      : { from: Math.max(0, hunk.from - 1), to: hunk.to };
  }
  return hunk.atEnd
    ? { from: doc.length, insert: `\n${hunk.old}` }
    : { from: hunk.from, insert: `${hunk.old}\n` };
}

/** The hunk on a line range, preferring a change over a removal marker. */
export function hunkAt(
  hunks: readonly DocHunk[],
  from: number,
  to: number,
): DocHunk | undefined {
  let removal: DocHunk | undefined;
  for (const hunk of hunks) {
    if (hunk.kind === "deleted") {
      if (
        hunk.from >= from &&
        hunk.from <= to &&
        (hunk.from < to || hunk.atEnd || from === to)
      ) {
        removal ??= hunk;
      }
    } else if (hunk.from <= to && hunk.to >= from) {
      return hunk;
    }
  }
  return removal;
}

/** The text a hunk covers now. */
export function currentText(state: EditorState, hunk: DocHunk): string {
  return hunk.kind === "deleted" ? "" : state.sliceDoc(hunk.from, hunk.to);
}
