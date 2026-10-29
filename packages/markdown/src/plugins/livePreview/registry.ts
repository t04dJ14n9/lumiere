import { Facet } from "@codemirror/state";
import { revealRanges } from "../../webview/ui/pointer-selection";
import type { EditorState } from "@codemirror/state";
import type { SyntaxNode, Tree } from "@lezer/common";
import { documentTree } from "./document-tree";
import { inlineHtmlEnd } from "./inline-html";
import { embedsImage } from "../../markdown/images";
import type { BlockRenderer, InlineContext, InlineRenderer } from "./api";
export const blockRenderers = Facet.define<
  BlockRenderer,
  readonly BlockRenderer[]
>({
  combine: (values) => values,
});
export const inlineRenderers = Facet.define<
  InlineRenderer,
  readonly InlineRenderer[]
>({
  combine: (values) => values,
});
/** Inclusive endpoints keep source visible at a block's last character. */
export function revealed(
  state: EditorState,
  from: number,
  to: number,
): boolean {
  return revealRanges(state).some(
    (range) => range.from <= to && range.to >= from,
  );
}

const inlineElements = new Set([
  "StrongEmphasis",
  "Emphasis",
  "Strikethrough",
  "Highlight",
  "InlineCode",
  "Link",
  "Autolink",
  "WikiLink",
  "WikiEmbed",
  "Image",
  "InlineMath",
  "HTMLTag",
]);
type RevealRange = { from: number; to: number };
// Syntax, not selection, determines chains. Reuse them while the caret moves.
const inlineChains = new WeakMap<Tree, Map<number, readonly RevealRange[]>>();

/** Outermost inline elements and their zero-gap neighbours reveal together. */
export function inlineRevealRange(
  state: EditorState,
  from: number,
  to: number,
): RevealRange {
  const tree = state.field(documentTree);
  let node: SyntaxNode | null = tree.resolveInner(from, 1);
  while (node) {
    // Inline HTML pairs are siblings, not ancestors, in Lezer's tree.
    if (
      /^(Paragraph|Task|ATXHeading[1-6]|SetextHeading[1-6]|TableCell)$/.test(
        node.name,
      )
    ) {
      break;
    }
    node = node.parent;
  }
  if (!node) {
    return { from, to };
  }
  let scopes = inlineChains.get(tree);
  if (!scopes) {
    scopes = new Map();
    inlineChains.set(tree, scopes);
  }
  let chains = scopes.get(node.from);
  if (!chains) {
    chains = collectInlineChains(state, node);
    scopes.set(node.from, chains);
  }
  return (
    chains.find((range) => range.from <= from && range.to >= to) ?? { from, to }
  );
}

function collectInlineChains(
  state: EditorState,
  scope: SyntaxNode,
): RevealRange[] {
  const elements: RevealRange[] = [];
  scope.cursor().iterate((node) => {
    // An image keeps rendered and joins no chain, as in Obsidian 1.13.
    const image =
      (node.name === "Image" || node.name === "WikiEmbed") &&
      embedsImage(state.sliceDoc(node.from, node.to));
    if (inlineElements.has(node.name) && !image) {
      elements.push({
        from: node.from,
        to: inlineHtmlEnd(node.node, state) ?? node.to,
      });
    }
  });
  const chains: RevealRange[] = [];
  for (const element of elements) {
    const previous = chains.at(-1);
    if (previous && element.from <= previous.to) {
      previous.to = Math.max(previous.to, element.to);
    } else {
      chains.push({ ...element });
    }
  }
  return chains;
}

export interface PersistentInlineEntry {
  name: string;
  from: number;
  to: number;
  node: SyntaxNode;
}
const persistentNodesCache = new WeakMap<
  Tree,
  Map<string, readonly PersistentInlineEntry[]>
>();

export function cachedPersistentNodes(
  tree: Tree,
  persistent: ReadonlySet<string>,
): readonly PersistentInlineEntry[] {
  const key = [...persistent].sort().join("|");
  let byKey = persistentNodesCache.get(tree);
  if (!byKey) {
    byKey = new Map();
    persistentNodesCache.set(tree, byKey);
  }
  const existing = byKey.get(key);
  if (existing) {
    return existing;
  }
  const found: PersistentInlineEntry[] = [];
  tree.iterate({
    enter: (node) => {
      if (!persistent.has(node.name)) {
        return;
      }
      found.push({
        name: node.name,
        from: node.from,
        to: node.to,
        node: node.node,
      });
      return false;
    },
  });
  byKey.set(key, found);
  return found;
}

export function decoratePersistentOffViewport(
  state: EditorState,
  builder: InlineContext,
  visibleRanges: readonly { from: number; to: number }[],
): void {
  const allRenderers = state.facet(inlineRenderers);
  const persistent = new Set(
    allRenderers.filter((r) => r.persistent).flatMap((r) => r.nodes),
  );
  if (persistent.size === 0) {
    return;
  }
  for (const entry of cachedPersistentNodes(
    state.field(documentTree),
    persistent,
  )) {
    if (!visibleRanges.some((v) => entry.from < v.to && entry.to > v.from)) {
      allRenderers
        .find((r) => r.nodes.includes(entry.name))
        ?.decorate(entry.node, builder);
    }
  }
}
