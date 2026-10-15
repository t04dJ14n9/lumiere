import type { EditorState, Transaction } from "@codemirror/state";
import {
  revealFreezeToggled,
  revealRanges,
} from "../../webview/ui/pointer-selection";
import type { Tree } from "@lezer/common";
import { documentTree } from "./document-tree";
import { blockRenderers } from "./registry";

/**
 * Which lines of the new document a transaction may have re-rendered, and
 * why. `text`: the source changed there, so its blocks are indexed again.
 * `selection`: the caret entered or left there, so blocks may reveal or
 * hide their source. `metadata`: something outside the text changed (a
 * renderer, an effect such as a resource refresh), so every line counts.
 */
export interface RenderInvalidation {
  fromLine: number;
  toLine: number;
  reason: "text" | "metadata" | "selection";
}

/** A span of the new document, in character positions. */
export interface Region {
  from: number;
  to: number;
}

const regions = new WeakMap<Transaction, Region | null>();

/**
 * The part of the new document whose blocks a text change may have
 * altered: every top-level syntax node, old or new, that touches the
 * change or the region found so far, widened to whole lines until stable.
 * Invariant: outside it, the syntax tree's top-level nodes are the old
 * ones, shifted, so blocks found there before are still exactly the blocks
 * there. (Deleting a fence's closing line extends the fence over text that
 * an old math block began in; that old block touches the region, so
 * everything it covered is inside.) `null` when the document did not
 * change.
 */
export function changedRegion(tr: Transaction): Region | null {
  const cached = regions.get(tr);
  if (cached !== undefined) {
    return cached;
  }
  const region = tr.docChanged ? computeRegion(tr) : null;
  regions.set(tr, region);
  return region;
}

function computeRegion(tr: Transaction): Region {
  let from = Infinity;
  let to = -Infinity;
  tr.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
    from = Math.min(from, fromB);
    to = Math.max(to, toB);
  });
  const oldTree = tr.startState.field(documentTree, false);
  const back = tr.changes.invertedDesc;
  for (;;) {
    const next = settle(tr.state, { from, to });
    if (oldTree) {
      const oldFrom = back.mapPos(next.from, -1);
      const oldTo = back.mapPos(next.to, 1);
      for (const node of topLevel(oldTree, oldFrom, oldTo)) {
        next.from = Math.min(next.from, tr.changes.mapPos(node.from, -1));
        next.to = Math.max(next.to, tr.changes.mapPos(node.to, 1));
      }
    }
    if (next.from === from && next.to === to) {
      return next;
    }
    ({ from, to } = next);
  }
}

/** Widen to whole lines and to every new top-level node touched, until stable. */
function settle(state: EditorState, start: Region): Region {
  const tree = state.field(documentTree);
  let { from, to } = start;
  for (;;) {
    const lineFrom = state.doc.lineAt(from).from;
    const lineTo = state.doc.lineAt(to).to;
    let nextFrom = lineFrom;
    let nextTo = lineTo;
    for (const node of topLevel(tree, lineFrom, lineTo)) {
      nextFrom = Math.min(nextFrom, node.from);
      nextTo = Math.max(nextTo, node.to);
    }
    if (nextFrom === from && nextTo === to) {
      return { from, to };
    }
    from = nextFrom;
    to = nextTo;
  }
}

/**
 * Top-level nodes that touch `[from, to]` (inclusive). Starts at the first
 * one ending at or after `from` (`childAfter` descends the balanced tree),
 * so the cost does not grow with the nodes before the range.
 */
function topLevel(tree: Tree, from: number, to: number): Region[] {
  const nodes: Region[] = [];
  let node =
    from > 0 ? tree.topNode.childAfter(from - 1) : tree.topNode.firstChild;
  for (; node; node = node.nextSibling) {
    if (node.from > to) {
      break;
    }
    if (node.to >= from) {
      nodes.push({ from: node.from, to: node.to });
    }
  }
  return nodes;
}

/** Whether a transaction changes anything besides the text and selection. */
export function changesMetadata(tr: Transaction): boolean {
  return (
    tr.effects.length > 0 ||
    tr.reconfigured ||
    tr.startState.facet(blockRenderers) !== tr.state.facet(blockRenderers)
  );
}

/** The invalidations of one transaction, in new-document lines. */
export function renderInvalidations(tr: Transaction): RenderInvalidation[] {
  const doc = tr.state.doc;
  if (changesMetadata(tr)) {
    return [{ fromLine: 1, toLine: doc.lines, reason: "metadata" }];
  }
  const result: RenderInvalidation[] = [];
  const region = changedRegion(tr);
  if (region) {
    result.push({
      fromLine: doc.lineAt(region.from).number,
      toLine: doc.lineAt(region.to).number,
      reason: "text",
    });
  }
  if (
    tr.selection ||
    tr.docChanged ||
    revealFreezeToggled(tr.startState, tr.state)
  ) {
    const before = revealRanges(tr.startState).map((range) =>
      range.map(tr.changes),
    );
    for (const range of [...before, ...revealRanges(tr.state)]) {
      result.push({
        fromLine: doc.lineAt(range.from).number,
        toLine: doc.lineAt(range.to).number,
        reason: "selection",
      });
    }
  }
  return result;
}
