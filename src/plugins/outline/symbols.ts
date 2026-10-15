import type { NoteMetadata } from "../../markdown/metadata";

/** A heading symbol with document offsets, nested like Note Outline. */
export interface OutlineSymbolNode {
  name: string;
  level: number;
  /** Full section coverage (contains the selection and all children). */
  start: number;
  end: number;
  /** Heading line only, used as the navigation target. */
  selectionStart: number;
  selectionEnd: number;
  children: OutlineSymbolNode[];
}

/**
 * Nest heading symbols the same way Note Outline nests them (`outlineOf`),
 * keeping section and heading ranges.
 */
export function outlineSymbols(
  headings: NoteMetadata["headings"],
): OutlineSymbolNode[] {
  const roots: OutlineSymbolNode[] = [];
  const stack: OutlineSymbolNode[] = [];
  for (const heading of headings) {
    while (stack.length > 0 && stack.at(-1)!.level >= heading.level) {
      stack.pop();
    }
    const parent = stack.at(-1);
    const selectionStart = heading.position.start.offset;
    const selectionEnd = heading.position.end.offset;
    const node: OutlineSymbolNode = {
      name: heading.heading || "(empty)",
      level: heading.level,
      start: selectionStart,
      end: Math.max(heading.end, selectionEnd),
      selectionStart,
      selectionEnd,
      children: [],
    };
    (parent ? parent.children : roots).push(node);
    // Metadata clips quoted sections to their blockquote. Level-based nesting
    // can include headings outside that quote, so every ancestor must grow.
    for (const ancestor of stack) {
      ancestor.end = Math.max(ancestor.end, node.end);
    }
    stack.push(node);
  }
  return roots;
}
