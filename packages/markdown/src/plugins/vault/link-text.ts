import {
  folderOf,
  isMarkdownPath,
  lookupKey,
  nameOf,
  relativeVaultPath,
} from "../../shared/vault-path";
import type { VaultFile } from "./api";
import type { FileTable } from "./file-table";

/** Obsidian's **New link format** (`markdownWorkshop.links.newLinkFormat`). */
export type LinkFormat = "shortest" | "relative" | "absolute";

/**
 * The text a new link to `target` uses, as Obsidian's `fileToLinktext`. Notes
 * drop their `.md` extension; other files keep theirs.
 */
export function linkText(
  files: FileTable,
  target: VaultFile,
  sourcePath: string,
  format: LinkFormat,
): string {
  if (format === "relative") {
    return withoutNoteExtension(
      relativeVaultPath(folderOf(sourcePath), target.path),
    );
  }
  if (format === "shortest" && isUniqueName(files, target)) {
    return withoutNoteExtension(nameOf(target.path));
  }
  return withoutNoteExtension(target.path);
}

function isUniqueName(files: FileTable, target: VaultFile): boolean {
  return files.withKey(lookupKey(target.path)).length === 1;
}

function withoutNoteExtension(path: string): string {
  return isMarkdownPath(path) ? path.slice(0, -3) : path;
}
