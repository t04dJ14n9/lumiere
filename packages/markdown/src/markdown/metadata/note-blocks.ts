import type { NoteMetadata } from "./types";

/** A block a link can point to (`[[Note#^id]]`), as Obsidian lists them. */
export interface NoteBlock {
  from: number;
  to: number;
  /** The block's text as a suggestion shows it, without its Markdown. */
  text: string;
  /** Its `^id`, when it has one. */
  id?: string;
  /** Where a new id goes: after a space, or on a line of its own. */
  idAt: number;
  idBefore: " " | "\n\n";
}

/** Sections Obsidian does not offer: properties, rules, HTML. */
const SKIPPED = new Set([
  "Frontmatter",
  "HorizontalRule",
  "HTMLBlock",
  "BulletList",
  "OrderedList",
  "LinkReference",
]);

const ID_AT_END = /[ \t]+\^([A-Za-z0-9-]+)[ \t]*$/u;

/** Inline Markdown left out of a block's text: footnote references, markers, link syntax. */
function plain(text: string): string {
  return text
    .replace(/\[\^[^\]]+\]/gu, "")
    .replace(/!?\[\[([^\]|]*\|)?([^\]]*)\]\]/gu, "$2")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/(\*\*|__|~~|==|\*|_|`)/gu, "")
    .trim();
}

function withoutId(text: string): { text: string; id?: string } {
  const lines = text.split("\n");
  const match = ID_AT_END.exec(lines.at(-1)!);
  if (!match) {
    return { text };
  }
  lines[lines.length - 1] = lines.at(-1)!.slice(0, match.index);
  return { text: lines.join("\n"), id: match[1]! };
}

/** The shown text of a section other than a paragraph or list item. */
function sectionText(type: string, source: string): string {
  const lines = source.split("\n");
  if (type === "Blockquote") {
    return lines
      .map((line) => line.replace(/^\s*>\s?/u, ""))
      .map((line) => line.replace(/^\[![^\]]+\][+-]?\s*/u, ""))
      .map(plain)
      .filter(Boolean)
      .join("\n");
  }
  if (type === "FencedCode" || type === "MathBlock") {
    return lines.slice(1, -1).join("\n");
  }
  if (type === "Table") {
    return lines
      .filter((line) => !/^\s*\|?[\s:|-]+\|?\s*$/u.test(line))
      .map((line) =>
        line
          .replace(/^\s*\|/u, "")
          .replace(/\|\s*$/u, "")
          .split("|")
          .map((cell) => plain(cell))
          .join(" "),
      )
      .join("\n");
  }
  return source.trim();
}

/** A list item's text, its own line and its children's, without their markers. */
function itemText(source: string): string {
  return source
    .split("\n")
    .map((line) =>
      plain(line.replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[.\]\s+)?/u, "")),
    )
    .filter(Boolean)
    .join("\n");
}

/** Where a list item's own text ends: before its first child item. */
function itemEnd(source: string, from: number, to: number): number {
  const text = source.slice(from, to);
  const child = /\n[ \t]*(?:[-*+]|\d+[.)])[ \t]/u.exec(text);
  return from + (child ? child.index : text.trimEnd().length);
}

/**
 * Every block of a note in order, as Obsidian 1.14 offers them after
 * `[[Note#^` (measured): headings, paragraphs, each list item, quotes and
 * callouts, code, tables, math and footnote definitions; not properties,
 * rules, HTML or comments. A paragraph, list item or footnote takes a new id
 * after a space; any other block on a line of its own after it.
 */
export function noteBlocks(source: string, note: NoteMetadata): NoteBlock[] {
  const blocks: NoteBlock[] = [];
  for (const section of note.sections) {
    const from = section.position.start.offset;
    const to = section.position.end.offset;
    const text = source.slice(from, to);
    if (SKIPPED.has(section.type) || /^%%[\s\S]*%%$/u.test(text.trim())) {
      continue;
    }
    if (section.type === "Paragraph") {
      const bare = withoutId(text);
      blocks.push({
        from,
        to,
        text: plain(bare.text),
        ...(bare.id && { id: bare.id }),
        idAt: to,
        idBefore: " ",
      });
      continue;
    }
    const after = /^\s*\n\s*\^([A-Za-z0-9-]+)\s*(?:\n|$)/u.exec(
      source.slice(to),
    );
    blocks.push({
      from,
      to,
      text: sectionText(section.type, text),
      ...(after && { id: after[1]! }),
      idAt: to,
      idBefore: "\n\n",
    });
  }
  for (const item of note.listItems) {
    const from = item.position.start.offset;
    const own = itemEnd(source, from, item.position.end.offset);
    const bare = withoutId(source.slice(from, own));
    blocks.push({
      from,
      to: item.position.end.offset,
      text: itemText(bare.text + source.slice(own, item.position.end.offset)),
      ...(bare.id && { id: bare.id }),
      idAt: own,
      idBefore: " ",
    });
  }
  for (const footnote of note.footnotes.definitions) {
    const bare = withoutId(source.slice(footnote.from, footnote.to));
    blocks.push({
      from: footnote.from,
      to: footnote.to,
      text: plain(footnote.text),
      ...(bare.id && { id: bare.id }),
      idAt: footnote.to,
      idBefore: " ",
    });
  }
  return blocks.sort((a, b) => a.from - b.from);
}
