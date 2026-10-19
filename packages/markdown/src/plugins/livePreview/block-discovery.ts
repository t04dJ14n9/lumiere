import type { EditorState } from "@codemirror/state";
import type { SyntaxNode, SyntaxNodeRef, Tree } from "@lezer/common";
import { markdownParser } from "../../markdown/dialect";
import type { BlockRenderer } from "./api";
import type { Region } from "./invalidation";

// These custom blocks have no Lezer Block group. Inline children of LeafBlock
// nodes cannot contain any of these block types in the fixed Markdown dialect.
const blockNames = new Set([
  ...markdownParser.nodeSet.types
    .filter((type) => type.is("Block"))
    .map((type) => type.name),
  "Frontmatter",
  "MathBlock",
]);
interface BlockNode {
  node: SyntaxNode;
  subtreeEnd: number;
}
const cachedNodes = new WeakMap<Tree, readonly BlockNode[]>();

/** Reuse structural discovery across successive plugin registrations. */
function blockNodes(tree: Tree): readonly BlockNode[] {
  const cached = cachedNodes.get(tree);
  if (cached) {
    return cached;
  }
  const nodes: BlockNode[] = [];
  const parents: BlockNode[] = [];
  tree.iterate({
    enter(node) {
      if (!blockNames.has(node.name)) {
        return false;
      }
      const entry = { node: node.node, subtreeEnd: nodes.length + 1 };
      nodes.push(entry);
      if (node.type.is("LeafBlock")) {
        return false;
      }
      parents.push(entry);
      return undefined;
    },
    leave() {
      // Lezer skips leave for pruned nodes; every other entry is on this stack.
      parents.pop()!.subtreeEnd = nodes.length;
    },
  });
  cachedNodes.set(tree, nodes);
  return nodes;
}

export function visitRendererNodes(
  tree: Tree,
  options: {
    renderers: readonly BlockRenderer[];
    region?: Region;
    enter(node: SyntaxNodeRef): boolean | void;
  },
): void {
  const hasOnlyBlockNodes = options.renderers.every((renderer) =>
    renderer.nodes?.every((name) => blockNames.has(name)),
  );
  if (hasOnlyBlockNodes && !options.region) {
    const nodes = blockNodes(tree);
    for (let index = 0; index < nodes.length;) {
      const entry = nodes[index]!;
      index =
        options.enter(entry.node) === false ? entry.subtreeEnd : index + 1;
    }
    return;
  }
  // Region queries retain Lezer's bounded walk; unrestricted renderers can
  // still match inline nodes and use the original complete traversal.
  tree.iterate({
    ...(options.region && { from: options.region.from, to: options.region.to }),
    enter(node) {
      const descend = options.enter(node);
      return hasOnlyBlockNodes && node.type.is("LeafBlock") ? false : descend;
    },
  });
}

/** Keep catalog precedence while avoiding unrelated match predicates. */
export function rendererMatcher(renderers: readonly BlockRenderer[]) {
  const byName = new Map<string, readonly BlockRenderer[]>();
  return (node: SyntaxNodeRef, state: EditorState) => {
    let candidates = byName.get(node.name);
    if (!candidates) {
      candidates = renderers.filter(
        (renderer) => !renderer.nodes || renderer.nodes.includes(node.name),
      );
      byName.set(node.name, candidates);
    }
    return candidates.find((renderer) => renderer.match(node, state));
  };
}
