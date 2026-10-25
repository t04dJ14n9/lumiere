import type { Tree, SyntaxNodeRef } from "@lezer/common";
import { wikiTarget, linkDestination } from "../html/helpers";
import { markdownParser } from "../dialect/parser";
import type { NoteMetadata, Position } from "./types";

type Collected = Pick<
  NoteMetadata,
  "links" | "embeds" | "tags" | "sections" | "listItems" | "footnotes"
>;
interface CollectionSource {
  text: string;
  syntax: Tree;
  map?: (offset: number) => number;
  inDefinition?: boolean;
}

export function linkReferences(
  source: string,
  tree: Tree,
): Map<string, string> {
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
  return references;
}

export class MetadataCollector {
  constructor(
    private readonly result: Collected,
    private readonly position: (from: number, to: number) => Position,
    private readonly references: Map<string, string>,
  ) {}

  collect({
    text,
    syntax,
    map = (n) => n,
    inDefinition = false,
  }: CollectionSource): void {
    syntax.iterate({
      enter: (node) => {
        if (
          !inDefinition &&
          this.result.footnotes.definitions.some(
            (note) => node.from >= note.from && node.to <= note.to,
          )
        ) {
          return false;
        }
        if (node.name === "ObsidianComment") {
          this.collectComment(text, node, map);
          return false;
        }
        const position = this.position(map(node.from), map(node.to));
        if (node.name === "Tag") {
          this.result.tags.push({
            tag: text.slice(node.from + 1, node.to),
            position,
          });
        }
        this.collectWikiLink(text, node, position);
        this.collectMarkdownLink(text, node, position);
        if (!inDefinition && node.node.parent?.name === "Document") {
          this.result.sections.push({ type: node.name, position });
        }
        this.collectListItem({ text, node, position, map });
      },
    });
  }

  /**
   * Obsidian indexes the links, embeds and tags inside a `%% comment %%`,
   * though they are not shown: its inside is parsed on its own.
   */
  private collectComment(
    text: string,
    node: SyntaxNodeRef,
    map: (offset: number) => number,
  ): void {
    const from = node.from + 2;
    const inner = text.slice(from, Math.max(from, node.to - 2));
    this.collect({
      text: inner,
      syntax: markdownParser.parse(inner),
      map: (offset) => map(from + offset),
      // Like a definition's text: not the note's sections.
      inDefinition: true,
    });
  }

  private collectWikiLink(
    text: string,
    node: SyntaxNodeRef,
    position: Position,
  ): void {
    if (node.name !== "WikiLink" && node.name !== "WikiEmbed") {
      return;
    }
    const embed = node.name === "WikiEmbed";
    const raw = text.slice(node.from, node.to);
    const inner = raw.slice(embed ? 3 : 2, -2);
    // As Obsidian records it, `|` with nothing before it is part of the
    // link's name: `[[|Only Alias]]` links to a note named `|Only Alias`.
    const link = inner.startsWith("|")
      ? { target: inner, label: inner }
      : wikiTarget(inner);
    (embed ? this.result.embeds : this.result.links).push({
      link: link.target,
      original: raw,
      displayText: link.label,
      position,
    });
  }

  private collectMarkdownLink(
    text: string,
    node: SyntaxNodeRef,
    position: Position,
  ): void {
    if (!["Link", "Image", "Autolink"].includes(node.name)) {
      return;
    }
    // A reference-style link (`[text][ref]`) is not counted, as in Obsidian,
    // which neither resolves it nor lists it among unresolved links.
    const url = node.node.getChild("URL");
    const original = text.slice(node.from, node.to);
    const link = url ? linkDestination(text.slice(url.from, url.to)) : "";
    if (link) {
      (node.name === "Image" ? this.result.embeds : this.result.links).push({
        link,
        original,
        position,
      });
    }
  }

  private collectListItem({
    text,
    node,
    position,
    map,
  }: {
    text: string;
    node: SyntaxNodeRef;
    position: Position;
    map: (offset: number) => number;
  }): void {
    if (node.name !== "ListItem") {
      return;
    }
    const marker = /^\s*(?:[-+*]|\d+[.)])\s+\[([^\]])\]/.exec(
      text.slice(node.from, node.to),
    );
    let parent = node.node.parent;
    while (parent && parent.name !== "ListItem") {
      parent = parent.parent;
    }
    this.result.listItems.push({
      position,
      ...(marker ? { task: marker[1]! } : {}),
      parent: parent
        ? this.position(map(parent.from), map(parent.from)).start.line
        : -1,
    });
  }
}
