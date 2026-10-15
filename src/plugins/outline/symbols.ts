import type { NoteMetadata } from "../../markdown/metadata";

/** A heading symbol with document offsets, nested like Note Outline. */
export interface OutlineSymbolNode {
  name: string;
  level: number;
  /** Full section coverage (must contain the selection). */
  start: number;
  end: number;
  /** Heading line only — Go to Symbol / Outline selection. */
  selectionStart: number;
  selectionEnd: number;
  children: OutlineSymbolNode[];
}

/**
 * Nest headings for {@link vscode.DocumentSymbolProvider} the same way
 * Note Outline nests them (`outlineOf`), keeping section and heading ranges.
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
    stack.push(node);
  }
  return roots;
}
