import type { Tree, SyntaxNode } from "@lezer/common";
import type { NoteMetadata, Position } from "./types";

export function extractBlocks(
  source: string,
  tree: Tree,
  position: (from: number, to: number) => Position,
): NoteMetadata["blocks"] {
  const blocks = Object.create(null) as NoteMetadata["blocks"];
  for (const match of source.matchAll(
    /(?:^|[ \t])\^([A-Za-z0-9-]+)[ \t]*(?=\r?$)/gm,
  )) {
    let node = tree.resolve(match.index, 1);
    if (excludedBlock(node)) {
      continue;
    }
    while (
      node.parent &&
      !["Paragraph", "ListItem", "Blockquote", "Table"].includes(node.name)
    ) {
      node = node.parent;
    }
    const id = match[1]!;
    if (
      source.slice(node.from, node.to).trim() === "^" + id &&
      node.prevSibling
    ) {
      node = node.prevSibling;
    }
    blocks[id] = {
      id,
      from: node.from,
      to: node.to,
      text: source
        .slice(node.from, node.to)
        .replace(new RegExp(`(?:^|[ \\t])\\^${id}[ \\t]*(?=\\r?$)`, "gm"), ""),
      position: position(node.from, node.to),
    };
  }
  return blocks;
}

function excludedBlock(node: SyntaxNode): boolean {
  let ancestor = node;
  let excluded = false;
  while (ancestor.parent) {
    if (
      [
        "FencedCode",
        "CodeBlock",
        "Frontmatter",
        "MathBlock",
        "ObsidianComment",
      ].includes(ancestor.name)
    ) {
      excluded = true;
    }
    ancestor = ancestor.parent;
  }
  return excluded;
}
