import { Text } from "@codemirror/state";
import type { Tree } from "@lezer/common";
import { parseMarkdown, markdownParser } from "../dialect";
import { frontmatter } from "../properties";
import { validTag } from "../tags/grammar";
import { extractFootnotes } from "./footnote-extract";
import { frontmatterLinks } from "./frontmatter";
import { extractHeadings } from "./heading-extract";
import { wikiTarget, linkDestination } from "../html/helpers";
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
    frontmatter: header?.values,
    frontmatterLinks: [],
    aliases: [],
  };
  const references = new Map<string, string>();
  tree.iterate({
    enter(node) {
      if (node.name !== "LinkReference") {
        return;
      }
      const label = node.node.getChild("LinkLabel");
      const url = node.node.getChild("URL");
      if (label && url) {
        references.set(
          source
            .slice(label.from + 1, label.to - 1)
            .toLowerCase()
            .replace(/\s+/g, " "),
          linkDestination(source.slice(url.from, url.to)),
        );
      }
    },
  });
  const collect = (
    text: string,
    syntax: Tree,
    map: (offset: number) => number = (n) => n,
    inDefinition = false,
  ) => {
    syntax.iterate({
      enter(node) {
        if (
          !inDefinition &&
          result.footnotes.definitions.some(
            (note) => node.from >= note.from && node.to <= note.to,
          )
        ) {
          return false;
        }
        const from = map(node.from);
        const to = map(node.to);
        if (node.name === "Tag") {
          result.tags.push({
            tag: text.slice(node.from + 1, node.to),
            position: position(from, to),
          });
        }
        if (node.name === "WikiLink" || node.name === "WikiEmbed") {
          const embed = node.name === "WikiEmbed";
          const raw = text.slice(node.from, node.to);
          const link = wikiTarget(raw.slice(embed ? 3 : 2, -2));
          (embed ? result.embeds : result.links).push({
            link: link.target,
            original: raw,
            displayText: link.label,
            position: position(from, to),
          });
        }
        if (
          node.name === "Link" ||
          node.name === "Image" ||
          node.name === "Autolink"
        ) {
          const url = node.node.getChild("URL");
          const original = text.slice(node.from, node.to);
          const label = node.node.getChild("LinkLabel");
          const labelText =
            (label ? text.slice(label.from + 1, label.to - 1) : "") ||
            /^!?\[([^\]]+)\]/.exec(original)?.[1] ||
            "";
          const link = url
            ? linkDestination(text.slice(url.from, url.to))
            : references.get(labelText.toLowerCase().replace(/\s+/g, " "));
          if (link) {
            (node.name === "Image" ? result.embeds : result.links).push({
              link,
              original,
              position: position(from, to),
            });
          }
        }
        if (!inDefinition && node.node.parent?.name === "Document") {
          result.sections.push({
            type: node.name,
            position: position(from, to),
          });
        }
        if (node.name === "ListItem") {
          const marker = /^\s*(?:[-+*]|\d+[.)])\s+\[([^\]])\]/.exec(
            text.slice(node.from, node.to),
          );
          let parent = node.node.parent;
          while (parent && parent.name !== "ListItem") {
            parent = parent.parent;
          }
          result.listItems.push({
            position: position(from, to),
            ...(marker ? { task: marker[1]! } : {}),
            parent: parent ? point(map(parent.from)).line : -1,
          });
        }
      },
    });
  };
  collect(source, tree);
  // Definition bodies have their indentation removed; map all nested metadata back.
  for (const note of result.footnotes.definitions) {
    collect(
      note.text,
      markdownParser.parse(note.text),
      (offset) => {
        const segment = note.segments?.find(
          (s) => offset >= s.offset && offset <= s.offset + s.to - s.from,
        );
        return segment ? segment.from + offset - segment.offset : note.from;
      },
      true,
    );
  }
  for (const match of source.matchAll(
    /(?:^|[ \t])\^([A-Za-z0-9-]+)[ \t]*(?=\r?$)/gm,
  )) {
    let node = tree.resolve(match.index, 1);
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
    if (excluded) {
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
    result.blocks[id] = {
      id,
      from: node.from,
      to: node.to,
      text: source
        .slice(node.from, node.to)
        .replace(new RegExp(`(?:^|[ \\t])\\^${id}[ \\t]*(?=\\r?$)`, "gm"), ""),
      position: position(node.from, node.to),
    };
  }
  for (const value of Array.isArray(header?.values?.tags)
    ? header.values.tags
    : []) {
    const tag = typeof value === "string" ? value.replace(/^#/, "") : undefined;
    if (validTag(tag)) {
      result.tags.push({ tag, position: position(0, header!.end) });
    }
  }
  const aliases = header?.values?.aliases ?? header?.values?.alias;
  result.aliases = (
    Array.isArray(aliases)
      ? aliases
      : typeof aliases === "string"
        ? [aliases]
        : []
  ).filter((v): v is string => typeof v === "string");
  result.frontmatterLinks = frontmatterLinks(source, position);
  cache.set(doc, result);
  return result;
}
