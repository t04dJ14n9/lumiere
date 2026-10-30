import { folderOf, nameOf, relativeVaultPath } from "../shared/vault-path";
import { encodeLinkPath } from "../shared/workspace-path";

export interface EmbedLink {
  /** The attachment's vault path. */
  readonly path: string;
  /** The note's vault path. */
  readonly notePath: string;
  /** Obsidian's Use [[Wikilinks]]. */
  readonly useWikilinks: boolean;
  /** Obsidian's New link format. */
  readonly format: "shortest" | "relative" | "absolute";
  /** Whether no other vault file has the attachment's name. */
  readonly isNameUnique: boolean;
}

/** The embed a note gets for a saved attachment, as Obsidian would write it. */
export function embedFor(link: EmbedLink): string {
  let target = link.path;
  if (link.format === "relative") {
    target = relativeVaultPath(folderOf(link.notePath), link.path);
  } else if (link.format === "shortest" && link.isNameUnique) {
    target = nameOf(link.path);
  }
  return link.useWikilinks
    ? `![[${target}]]`
    : `![](${encodeLinkPath(target)})`;
}
