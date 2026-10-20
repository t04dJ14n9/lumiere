import { metadata } from "./metadata";
import { linkpathOf, vaultLinks } from "./metadata/linkpaths";
import type { Position } from "./metadata";

/** One line of context for a mention, shown under its note. */
export interface MentionLine {
  line: number;
  col: number;
  /** Offset of the mention in the note's text. */
  offset: number;
  text: string;
}

const CONTEXT_LENGTH = 200;

/** Lines of `text` whose links resolve to the target, one per link. */
export function linkedLines(
  text: string,
  isTarget: (linkpath: string) => boolean,
): MentionLine[] {
  const lines = text.split("\n");
  return vaultLinks(metadata(text))
    .filter((link) => isTarget(linkpathOf(link)!))
    .map((link) => contextLine(lines, link.position))
    .sort((a, b) => a.offset - b.offset);
}

/**
 * Lines that mention one of the note's names (its basename and aliases) as a
 * whole word outside any link, as Obsidian's **Unlinked mentions**.
 * Properties are not searched.
 */
export function unlinkedLines(
  text: string,
  names: readonly string[],
): MentionLine[] {
  const pattern = namePattern(names);
  if (!pattern) {
    return [];
  }
  const note = metadata(text);
  const skipped = [...note.links, ...note.embeds].map((link) => [
    link.position.start.offset,
    link.position.end.offset,
  ]);
  const bodyStart = note.frontmatter ? frontmatterEnd(text) : 0;
  const lines = text.split("\n");
  const mentions: MentionLine[] = [];
  for (const match of text.matchAll(pattern)) {
    const offset = match.index;
    const isInside = skipped.some(
      ([from, to]) => offset >= from! && offset < to!,
    );
    if (offset >= bodyStart && !isInside) {
      mentions.push(contextLine(lines, positionAt(lines, offset)));
    }
  }
  return mentions.sort((a, b) => a.offset - b.offset);
}

function namePattern(names: readonly string[]): RegExp | undefined {
  const words = names
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
    .sort((a, b) => b.length - a.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (words.length === 0) {
    return undefined;
  }
  return new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${words.join("|")})(?![\\p{L}\\p{N}])`,
    "giu",
  );
}

function frontmatterEnd(text: string): number {
  const match = /^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)\r?(?:\n|$)/.exec(text);
  return match ? match[0].length : 0;
}

function positionAt(lines: string[], offset: number): Position {
  let line = 0;
  let start = 0;
  while (line < lines.length - 1 && start + lines[line]!.length + 1 <= offset) {
    start += lines[line]!.length + 1;
    line++;
  }
  const point = { line, col: offset - start, offset };
  return { start: point, end: point };
}

function contextLine(lines: string[], position: Position): MentionLine {
  const { line, col, offset } = position.start;
  const raw = (lines[line] ?? "").replace(/\r$/, "");
  return { line, col, offset, text: trimContext(raw, col) };
}

/** Keep the mention visible when the line is long. */
function trimContext(line: string, col: number): string {
  const text = line.trim();
  if (text.length <= CONTEXT_LENGTH) {
    return text;
  }
  const start = Math.max(0, col - CONTEXT_LENGTH / 2);
  return `…${line.slice(start, start + CONTEXT_LENGTH).trim()}…`;
}
