import {
  decodeLinkPath,
  isExternalLink,
  splitLinktext,
  type LinkSyntax,
} from "../../shared/vault-path";
import type { LinkMetadata, NoteMetadata } from "./types";

/** Wikilinks keep their brackets; every other vault link is Markdown. */
export function linkSyntax(link: Pick<LinkMetadata, "original">): LinkSyntax {
  return /^!?\[\[/.test(link.original) ? "wikilink" : "markdown";
}

/**
 * The vault path a link names, as written and without its `#subpath`, or
 * `undefined` for external URLs and in-note links (`#Heading`). Markdown link
 * destinations are percent-decoded; wikilinks are taken as they are.
 */
export function linkpathOf(link: LinkMetadata): string | undefined {
  if (isExternalLink(link.link)) {
    return undefined;
  }
  const isWikilink = /^!?\[\[/.test(link.original);
  const { path } = splitLinktext(
    isWikilink ? link.link : decodeLinkPath(link.link),
  );
  return path || undefined;
}

/** Every link that can name a vault file: links, embeds and property links. */
export function vaultLinks(metadata: NoteMetadata): LinkMetadata[] {
  return [
    ...metadata.links,
    ...metadata.embeds,
    ...metadata.frontmatterLinks,
  ].filter((link) => linkpathOf(link) !== undefined);
}
