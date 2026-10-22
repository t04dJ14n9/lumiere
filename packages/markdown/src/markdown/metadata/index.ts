import { Text } from "@codemirror/state";
import { parseMarkdown, markdownParser } from "../dialect/parser";
import { frontmatter } from "../properties";
import { validTag } from "../tags/grammar";
import { extractFootnotes, type Footnote } from "./footnote-extract";
import { frontmatterLinks } from "./frontmatter";
import { extractHeadings } from "./heading-extract";
import { extractBlocks } from "./block-extract";
import { linkReferences, MetadataCollector } from "./collect";
import type { NoteMetadata, Position } from "./types";
export type {
  NoteMetadata,
  Position,
  SourcePosition,
  LinkMetadata,
} from "./types";
const cache = new WeakMap<Text, NoteMetadata>();
/** One full-document parse, shared with editor indexes through the immutable Text key. */
export function metadata(input: string | Text): NoteMetadata {
  const doc = typeof input === "string" ? Text.of(input.split("\n")) : input;
  const cached = cache.get(doc);
  if (cached) {
    return cached;
  }
  const result = extractMetadata(doc);
  cache.set(doc, result);
  return result;
}

function extractMetadata(doc: Text): NoteMetadata {
  const source = doc.toString();
  const tree = parseMarkdown(doc);
  const point = (offset: number) => {
    const line = doc.lineAt(Math.min(offset, doc.length));
    return { line: line.number - 1, col: offset - line.from, offset };
  };
  const position = (from: number, to: number): Position => ({
    start: point(from),
    end: point(to),
  });
  const header = frontmatter(source);
  const result: NoteMetadata = {
    links: [],
    embeds: [],
    tags: [],
    headings: extractHeadings(source, tree).map((h) => ({
      ...h,
      heading: h.label,
      position: position(h.from, h.to),
    })),
    sections: [],
    blocks: Object.create(null) as NoteMetadata["blocks"],
    footnotes: extractFootnotes(doc, tree),
    listItems: [],
    ...(header && { frontmatter: header.values }),
    frontmatterLinks: [],
    aliases: [],
  };
  const collector = new MetadataCollector(
    result,
    position,
    linkReferences(source, tree),
  );
  collector.collect({ text: source, syntax: tree });
  collectDefinitions(collector, result.footnotes.definitions);
  result.blocks = extractBlocks(source, tree, position);
  for (const value of Array.isArray(header?.values?.tags)
    ? header.values.tags
    : []) {
    // Obsidian trims before it drops the `#`: `" #a "` is the tag `a`, and
    // `"# a"` is none.
    const tag =
      typeof value === "string" ? value.trim().replace(/^#/, "") : undefined;
    if (validTag(tag)) {
      result.tags.push({ tag, position: position(0, header!.end) });
    }
  }
  result.aliases = aliasValues(
    header?.values?.aliases ?? header?.values?.alias,
  );
  result.frontmatterLinks = frontmatterLinks(source, position, header?.yaml);
  return result;
}

function aliasValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  return typeof value === "string" ? [value] : [];
}

function collectDefinitions(
  collector: MetadataCollector,
  definitions: Footnote[],
): void {
  // Definition bodies have their indentation removed; map all nested metadata back.
  for (const note of definitions) {
    collector.collect({
      text: note.text,
      syntax: markdownParser.parse(note.text),
      map: (offset) => {
        const segment = note.segments?.find(
          (s) => offset >= s.offset && offset <= s.offset + s.to - s.from,
        );
        return segment ? segment.from + offset - segment.offset : note.from;
      },
      inDefinition: true,
    });
  }
}
