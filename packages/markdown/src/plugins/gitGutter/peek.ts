import { syntaxTree } from "@codemirror/language";
import { StateEffect, StateField } from "@codemirror/state";
import type { EditorState, Extension } from "@codemirror/state";
import { Decoration, EditorView, keymap } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import { alignBlocks, rowMarkdown } from "../../shared/diff";
import type { HunkRef } from "../../shared/git-diff";
import type { DocHunk } from "./api";
import { hunkAt, hunkField, revertChange } from "./hunks";
import { PeekWidget } from "./peek-widget";
import type { PeekActions } from "./peek-widget";

export type { PeekActions };

/** An open peek: a document offset, optionally tied to a snapshot hunk. */
export interface PeekOpen {
  readonly at: number;
  readonly ref: HunkRef;
}

export type PeekPosition = number | PeekOpen;

export function peekAt(value: PeekPosition | null): number | null {
  if (value === null) {
    return null;
  }
  return typeof value === "number" ? value : value.at;
}

export function peekRef(value: PeekPosition | null): HunkRef | undefined {
  if (value === null || typeof value === "number") {
    return undefined;
  }
  return value.ref;
}

/** The open peek, as a document position inside its hunk (and its snapshot ref). */
export const setPeek = StateEffect.define<PeekPosition | null>();

export const peekState = StateField.define<PeekPosition | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setPeek)) {
        return effect.value;
      }
    }
    return value === null ? null : mapPeek(value, tr.changes);
  },
});

function mapPeek(
  value: PeekPosition,
  changes: { mapPos(pos: number, assoc: number): number },
): PeekPosition {
  if (typeof value === "number") {
    return changes.mapPos(value, -1);
  }
  return { ...value, at: changes.mapPos(value.at, -1) };
}

/** Every hunk can open a raw peek, including pure additions. */
export function canPeek(_hunk: DocHunk): boolean {
  return true;
}

const HUNK_RANK = { modified: 3, added: 2, deleted: 1 } as const;

function hitsRange(hunk: DocHunk, from: number, to: number): boolean {
  if (hunk.kind === "deleted") {
    return (
      hunk.from >= from &&
      hunk.from <= to &&
      (hunk.from < to || hunk.atEnd || from === to)
    );
  }
  return hunk.from <= to && hunk.to >= from;
}

/**
 * Hunk to open for a gutter click spanning `from`..`to`. Prefers the change the
 * bar itself shows (modified over added over deleted) so a mixed block does
 * not open an earlier added row.
 */
export function peekTargetAt(
  hunks: readonly DocHunk[],
  from: number,
  to: number,
): DocHunk | undefined {
  let best: DocHunk | undefined;
  for (const hunk of hunks) {
    if (!canPeek(hunk) || !hitsRange(hunk, from, to)) {
      continue;
    }
    if (!best || HUNK_RANK[hunk.kind] > HUNK_RANK[best.kind]) {
      best = hunk;
    }
  }
  return best;
}

/** The hunk the peek shows, if it still exists. */
export function peekedHunk(state: EditorState): DocHunk | undefined {
  const stored = state.field(peekState, false);
  if (stored === null || stored === undefined) {
    return undefined;
  }
  const at = peekAt(stored);
  if (at === null) {
    return undefined;
  }
  const hunk = hunkAt(state.field(hunkField).hunks, at, at);
  return hunk && canPeek(hunk) ? hunk : undefined;
}

/** Old and new Markdown for each side of the peek, aligned by block. */
export function peekMarkdown(
  old: string,
  current: string,
): { before: string; after: string } {
  const rows = alignBlocks(old, current).map((row) => rowMarkdown(row));
  return {
    before: rows
      .flatMap((row) => (row.before ? [row.before] : []))
      .join("\n\n"),
    after: rows.flatMap((row) => (row.after ? [row.after] : [])).join("\n\n"),
  };
}

/** The enclosing blocks of a change, before and now, for display only. */
export interface PeekContext {
  readonly old: string;
  readonly now: string;
}

export { adoptPass, endLifetime } from "../../shared/render-lifetime";
export type { PassLifetime as Lifetime } from "../../shared/render-lifetime";

/** The top-level Markdown blocks (and frontmatter) a range touches. */
export function outerBlock(
  state: EditorState,
  from: number,
  to: number,
): { from: number; to: number } {
  let start = from;
  let end = to;
  const front = frontmatterRange(state);
  if (front && from <= front.to) {
    start = Math.min(start, front.from);
    end = Math.max(end, front.to);
  }
  const top = syntaxTree(state).topNode;
  for (let child = top.firstChild; child; child = child.nextSibling) {
    if (child.from <= to && child.to >= from && child.to > child.from) {
      start = Math.min(start, child.from);
      end = Math.max(end, child.to);
    }
  }
  return { from: start, to: end };
}

function frontmatterRange(
  state: EditorState,
): { from: number; to: number } | undefined {
  const { doc } = state;
  if (doc.lines < 2 || doc.line(1).text !== "---") {
    return undefined;
  }
  for (let n = 2; n <= Math.min(doc.lines, 2000); n++) {
    const text = doc.line(n).text;
    if (text === "---" || text === "...") {
      return { from: 0, to: doc.line(n).to };
    }
  }
  return undefined;
}

/**
 * Whole enclosing blocks (a fence, a table with its header, frontmatter with
 * its delimiters) on both sides, so the peek renders the structure the change
 * sits in. The old side is the block with the change put back; Revert still
 * applies only the narrow hunk.
 */
export function peekContext(state: EditorState, hunk: DocHunk): PeekContext {
  const change = revertChange(state, hunk);
  const to = change.to ?? change.from;
  const block = outerBlock(
    state,
    Math.min(hunk.from, change.from),
    Math.max(hunk.to, to),
  );
  const from = Math.min(block.from, change.from);
  const end = Math.max(block.to, to);
  return {
    old:
      state.sliceDoc(from, change.from) +
      (change.insert ?? "") +
      state.sliceDoc(to, end),
    now: state.sliceDoc(from, end),
  };
}

const closePeek = keymap.of([
  {
    key: "Escape",
    run: (view) => {
      if (view.state.field(peekState) === null) {
        return false;
      }
      view.dispatch({ effects: setPeek.of(null) });
      return true;
    },
  },
]);

function buildPeek(state: EditorState, actions: PeekActions): DecorationSet {
  const hunk = peekedHunk(state);
  if (!hunk) {
    return Decoration.none;
  }
  const { hunks } = state.field(hunkField);
  const widget = new PeekWidget(
    {
      hunk,
      index: hunks.indexOf(hunk),
      total: hunks.length,
      line:
        hunk.kind === "deleted"
          ? hunk.oldLine
          : state.doc.lineAt(hunk.from).number,
    },
    actions,
  );
  const below = hunk.kind !== "deleted" || hunk.atEnd;
  // Outside the rendered block (properties, table, callout) the change is in,
  // where the block's widget would hide it.
  const block = outerBlock(state, hunk.from, hunk.to);
  const at = below
    ? state.doc.lineAt(Math.max(hunk.to, block.to)).to
    : Math.min(hunk.from, block.from);
  return Decoration.set(
    Decoration.widget({ widget, block: true, side: below ? 1 : -1 }).range(at),
  );
}

/** The peek zone below a hunk, and Escape to close it. */
export function peekExtension(actions: PeekActions): Extension {
  const decorations = StateField.define<DecorationSet>({
    create: (state) => buildPeek(state, actions),
    update(value, tr) {
      if (
        tr.startState.field(peekState, false) !== tr.state.field(peekState) ||
        tr.startState.field(hunkField, false) !== tr.state.field(hunkField)
      ) {
        return buildPeek(tr.state, actions);
      }
      return value.map(tr.changes);
    },
    provide: (field) => EditorView.decorations.from(field),
  });
  return [peekState, decorations, closePeek];
}
