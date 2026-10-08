import type { SyntaxNodeRef, Tree } from "@lezer/common";
import { lowerBound } from "../../shared/positions";
import type { Footnote } from "./footnote-extract";
export interface FootnoteCandidate {
  from: number;
  to: number;
  label?: string;
  text?: string;
}

export function collectFootnoteCandidates(options: {
  text: string;
  syntax: Tree;
  definitions: readonly Pick<Footnote, "from" | "to">[];
  position(at: number): number | undefined;
  inDefinition?: boolean;
}): FootnoteCandidate[] {
  const { text, syntax, definitions, position, inDefinition = false } = options;
  const definitionPositions = definitions.map((note) => note.from);
  const candidates: FootnoteCandidate[] = [];
  syntax.iterate({
    enter(node) {
      if (!["FootnoteRef", "InlineFootnote"].includes(node.name)) {
        return;
      }
      const containing =
        definitions[lowerBound(definitionPositions, node.from + 1) - 1];
      if (!inDefinition && containing && node.from < containing.to) {
        return false;
      }
      const from = position(node.from);
      const to = position(node.to);
      let body = text.slice(node.from + 2, node.to - 1);
      if (node.name === "InlineFootnote" && body.includes("\n")) {
        body = inlineBody(text, node, body);
      }
      if (from !== undefined && to !== undefined) {
        candidates.push({
          from,
          to,
          ...(node.name === "FootnoteRef" ? { label: body } : { text: body }),
        });
      }
      return false;
    },
  });
  return candidates;
}

function inlineBody(text: string, node: SyntaxNodeRef, body: string): string {
  let parent = node.node.parent;
  let quotes = 0;
  let paragraphFrom = node.from;
  while (parent) {
    if (parent.name === "Blockquote") {
      quotes++;
    }
    if (parent.name === "Paragraph") {
      paragraphFrom = parent.from;
    }
    parent = parent.parent;
  }
  const stripQuotes = (line: string): string => {
    for (let i = 0; i < quotes; i++) {
      line = line.replace(/^ {0,3}> ?/, "");
    }
    return line;
  };
  const prefix = stripQuotes(
    text.slice(text.lastIndexOf("\n", paragraphFrom - 1) + 1, paragraphFrom),
  );
  return body
    .split("\n")
    .map((line, index) => {
      if (!index) {
        return line;
      }
      line = stripQuotes(line);
      return prefix.length && line.startsWith(" ".repeat(prefix.length))
        ? line.slice(prefix.length)
        : line;
    })
    .join("\n");
}
