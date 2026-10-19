import { metadata } from "../../markdown/metadata";
import { noteFragment } from "../../markdown/metadata/fragments";
import { linkSyntax } from "../../markdown/metadata/linkpaths";
import type { TextEdit } from "../../shared/host";
import {
  decodeLinkPath,
  isExternalLink,
  splitLinktext,
  type LinkSyntax,
} from "../../shared/vault-path";

/** A heading to rename: where it starts, its name and where the name is. */
export interface HeadingToRename {
  from: number;
  name: string;
  nameFrom: number;
  nameTo: number;
}

/** The ATX heading on the line holding `offset`, if there is one. */
export function headingAt(
  text: string,
  offset: number,
): HeadingToRename | undefined {
  const lineFrom = text.lastIndexOf("\n", offset - 1) + 1;
  const lineEnd = text.indexOf("\n", offset);
  const line = text
    .slice(lineFrom, lineEnd < 0 ? undefined : lineEnd)
    .replace(/\r$/u, "");
  const match = /^( {0,3}#{1,6}[ \t]+)(.*?)(?:[ \t]+#+)?[ \t]*$/u.exec(line);
  // Only a heading the note's metadata has: not a `#` line in code.
  const known = metadata(text).headings.some(
    (heading) => heading.position.start.offset === lineFrom,
  );
  if (!match || !known || !match[2]) {
    return undefined;
  }
  const nameFrom = lineFrom + match[1]!.length;
  return {
    from: lineFrom,
    name: match[2],
    nameFrom,
    nameTo: nameFrom + match[2].length,
  };
}

/** The note holding the renamed heading, as links to it are resolved. */
export interface RenamedHeading {
  /** The note's vault path and text before the rename. */
  path: string;
  text: string;
  heading: HeadingToRename;
  name: string;
}

/**
 * The edits that keep one note's links to a renamed heading working, as in
 * Obsidian: each link whose `#subpath` names the heading (as links resolve,
 * so case does not matter) gets the new name, keeping its path, form and
 * alias. Nested subpaths (`#Parent#Heading`) are left, as Obsidian leaves
 * them.
 */
export function headingLinkEdits(
  text: string,
  sourcePath: string,
  renamed: RenamedHeading,
  resolve: (
    linkpath: string,
    sourcePath: string,
    syntax: LinkSyntax,
  ) => string | undefined,
): TextEdit[] {
  const edits: TextEdit[] = [];
  const note = metadata(text);
  // Links within the note (`[[#Heading]]`) count too: they have no path.
  const links = [...note.links, ...note.embeds, ...note.frontmatterLinks];
  for (const link of links) {
    if (isExternalLink(link.link)) {
      continue;
    }
    const syntax = linkSyntax(link);
    const { path, subpath } = splitLinktext(
      syntax === "wikilink" ? link.link : decodeLinkPath(link.link),
    );
    const target = path ? resolve(path, sourcePath, syntax) : sourcePath;
    const fragment = subpath.slice(1);
    if (
      target !== renamed.path ||
      !fragment ||
      fragment.includes("#") ||
      noteFragment(renamed.text, fragment)?.from !== renamed.heading.from
    ) {
      continue;
    }
    edits.push({
      from: link.position.start.offset,
      to: link.position.end.offset,
      insert: withSubpath(link.original, renamed.name),
    });
  }
  return edits;
}

/** A link's source text with its `#subpath` replaced by `name`. */
function withSubpath(original: string, name: string): string {
  const wikilink = /^(!?\[\[[^\]|#]*)#[^\]|]*((?:\|[^\]]*)?\]\])$/u.exec(
    original,
  );
  if (wikilink) {
    return `${wikilink[1]}#${name}${wikilink[2]}`;
  }
  return original.replace(
    /\]\((<?)([^)#>]*)#[^)>]*(>?)/u,
    (_, open: string, path: string, close: string) =>
      `](${open}${path}#${open ? name : name.replace(/ /gu, "%20")}${close}`,
  );
}
