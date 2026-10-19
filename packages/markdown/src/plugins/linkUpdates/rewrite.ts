import { metadata } from "../../markdown/metadata";
import type { LinkMetadata } from "../../markdown/metadata";
import {
  linkpathOf,
  linkSyntax,
  vaultLinks,
} from "../../markdown/metadata/linkpaths";
import type { FileTextEdits } from "../../shared/host";
import {
  folderOf,
  isMarkdownPath,
  lookupKey,
  nameOf,
  relativeVaultPath,
  splitLinktext,
  type LinkSyntax,
} from "../../shared/vault-path";

export type LinkFormat = "shortest" | "relative" | "absolute";

export interface RewriteContext {
  /** Old vault path → new vault path, for every file being renamed. */
  renames: ReadonlyMap<string, string>;
  /** Resolve a link path from a note, before the rename. */
  resolve(
    linkpath: string,
    sourcePath: string,
    syntax: LinkSyntax,
  ): string | undefined;
  /** Every vault path after the rename, to tell whether a name is unique. */
  pathsAfter: readonly string[];
  format: LinkFormat;
  /**
   * Policy-owned link text, such as an OKF bundle-absolute path. When it
   * returns a string, the new-link format setting does not apply.
   */
  preferredText?(targetPath: string, sourcePath: string): string | undefined;
}

type Edit = FileTextEdits["edits"][number];

/**
 * Edits that keep a note's links pointing at renamed files, as Obsidian's
 * **Automatically update internal links**. Each link keeps its form
 * (wikilink or Markdown link), its `#subpath` and its alias; the path is
 * written in the new-link format. A renamed note's own path-style links are
 * also rewritten when its folder changes.
 */
export function rewriteLinks(
  text: string,
  sourcePath: string,
  context: RewriteContext,
): Edit[] {
  const newSource = context.renames.get(sourcePath) ?? sourcePath;
  const edits: Edit[] = [];
  for (const link of vaultLinks(metadata(text))) {
    const linkpath = linkpathOf(link)!;
    const target = context.resolve(linkpath, sourcePath, linkSyntax(link));
    if (!target) {
      continue;
    }
    const newTarget = context.renames.get(target) ?? target;
    const sourceMoved =
      newSource !== sourcePath && folderOf(newSource) !== folderOf(sourcePath);
    const isPathStyle = linkpath.includes("/") || linkpath.startsWith(".");
    if (newTarget === target && !(sourceMoved && isPathStyle)) {
      continue;
    }
    const path = targetText(newTarget, newSource, context);
    edits.push({
      start: link.position.start,
      end: link.position.end,
      text: rewritten(link, path, newTarget),
    });
  }
  return edits;
}

/** The new path text for a link, without the `.md` of notes. */
function targetText(
  target: string,
  source: string,
  context: RewriteContext,
): string {
  const preferred = context.preferredText?.(target, source);
  if (preferred !== undefined) {
    return preferred;
  }
  const withoutNote = (path: string) =>
    isMarkdownPath(path) ? path.slice(0, -3) : path;
  if (context.format === "relative") {
    return withoutNote(relativeVaultPath(folderOf(source), target));
  }
  const key = lookupKey(target);
  const isUnique =
    context.pathsAfter.filter((path) => lookupKey(path) === key).length === 1;
  if (context.format === "shortest" && isUnique) {
    return withoutNote(nameOf(target));
  }
  return withoutNote(target);
}

/** The link's source text with only its path replaced. */
function rewritten(link: LinkMetadata, path: string, target: string): string {
  const wikilink = /^(!?)\[\[([^\]|#]*)(#[^\]|]*)?(\|[^\]]*)?\]\]$/.exec(
    link.original,
  );
  if (wikilink) {
    const [, bang = "", , subpath = "", alias = ""] = wikilink;
    return `${bang}[[${path}${subpath}${alias}]]`;
  }
  const { subpath } = splitLinktext(link.link);
  const extension = isMarkdownPath(target) ? ".md" : "";
  const destination = `${path}${extension}`.replace(/ /g, "%20") + subpath;
  return link.original.replace(
    /\]\((<?)[^)>]*(>?)/,
    (_, open, close) => `](${open}${destination}${close}`,
  );
}
