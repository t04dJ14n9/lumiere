import type { EditorState, Transaction } from "@codemirror/state";
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
 * altered: every top-level syntax node the change touches, before and
 * after, widened to whole lines until stable. Invariant: outside it, the
 * syntax tree's top-level nodes are the old ones, shifted, so blocks
 * found there before are still exactly the blocks there. (Closing an
 * unclosed fence shortens an old node that ran to the end; that old node
 * touched the change, so everything it covered is inside.) `null` when the
 * document did not change.
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
  let oldFrom = Infinity;
  let oldTo = -Infinity;
  let from = Infinity;
  let to = -Infinity;
  tr.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
    oldFrom = Math.min(oldFrom, fromA);
    oldTo = Math.max(oldTo, toA);
    from = Math.min(from, fromB);
    to = Math.max(to, toB);
  });
  const oldTree = tr.startState.field(documentTree, false);
  if (oldTree) {
    for (const node of topLevel(oldTree, oldFrom, oldTo)) {
      from = Math.min(from, tr.changes.mapPos(node.from, -1));
      to = Math.max(to, tr.changes.mapPos(node.to, 1));
    }
  }
  return settle(tr.state, { from, to });
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

/** Top-level nodes that touch `[from, to]` (inclusive). */
function topLevel(tree: Tree, from: number, to: number): Region[] {
  const nodes: Region[] = [];
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
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
  if (tr.selection || tr.docChanged) {
    const before = tr.startState.selection.map(tr.changes).ranges;
    for (const range of [...before, ...tr.state.selection.ranges]) {
      result.push({
        fromLine: doc.lineAt(range.from).number,
        toLine: doc.lineAt(range.to).number,
        reason: "selection",
      });
    }
  }
  return result;
}
