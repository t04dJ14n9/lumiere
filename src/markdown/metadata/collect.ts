import type { Tree, SyntaxNodeRef } from "@lezer/common";
import { wikiTarget, linkDestination } from "../html/helpers";
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
    const link = wikiTarget(raw.slice(embed ? 3 : 2, -2));
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
    const url = node.node.getChild("URL");
    const original = text.slice(node.from, node.to);
    const label = node.node.getChild("LinkLabel");
    const labelText =
      (label ? text.slice(label.from + 1, label.to - 1) : "") ||
      /^!?\[([^\]]+)\]/.exec(original)?.[1] ||
      "";
    const link = url
      ? linkDestination(text.slice(url.from, url.to))
      : this.references.get(labelText.toLowerCase().replace(/\s+/g, " "));
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
