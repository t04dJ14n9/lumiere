/**
 * Where a new sketch goes and how the note links to it, as Obsidian places
 * a pasted image: in the attachment folder, named by the time, embedded in
 * a paragraph of its own so Live Preview shows it as a block.
 */
import { SKETCH_EXTENSION } from "@workshop/ink/format";
import { SourceCoordinates } from "../../shared/document/coordinates";
import type { TextEdit } from "../../shared/host";
import {
  folderOf,
  joinVaultPath,
  nameOf,
  relativeVaultPath,
} from "../../shared/vault-path";
import { encodeLinkPath, safeRelative } from "../../shared/workspace-path";

/**
 * The vault folder for a note's attachments, from Obsidian's setting
 * (`attachmentFolderPath`): empty or `/` for the vault's root, `.` or `./`
 * for the note's own folder, `./sub` for a folder inside it, anything else
 * a folder from the root. A setting that would leave the vault reads as
 * the root.
 */
export function attachmentFolder(setting: string, notePath: string): string {
  const value = setting.trim();
  const noteFolder = folderOf(notePath);
  if (value === "." || value === "./") {
    return noteFolder;
  }
  if (value.startsWith("./")) {
    const inside = safeRelative(value.slice(2));
    return inside ? (joinVaultPath(noteFolder, inside) ?? noteFolder) : "";
  }
  return safeRelative(value.replace(/^\/+/, "")) ?? "";
}

/** A sketch's name from when it was drawn: `2026-10-22 14.03`, local time. */
export function sketchStem(date: Date): string {
  const two = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}.${two(date.getMinutes())}`;
}

/**
 * A new sketch's file name, not taken in its folder (compared without
 * case, as on the iPad's and the Mac's disks): `2026-10-22 14.03 2` for the
 * second in a minute.
 */
export function sketchFileName(
  date: Date,
  existing: readonly string[],
): string {
  const taken = new Set(existing.map((name) => name.toLowerCase()));
  const stem = sketchStem(date);
  for (let count = 1; ; count++) {
    const name = `${count === 1 ? stem : `${stem} ${count}`}${SKETCH_EXTENSION}`;
    if (!taken.has(name.toLowerCase())) {
      return name;
    }
  }
}

export interface EmbedLink {
  /** The sketch's vault path. */
  readonly path: string;
  /** The note's vault path. */
  readonly notePath: string;
  /** Obsidian's Use [[Wikilinks]]. */
  readonly useWikilinks: boolean;
  /** Obsidian's New link format. */
  readonly format: "shortest" | "relative" | "absolute";
  /** Whether no other vault file has the sketch's name. */
  readonly isNameUnique: boolean;
}

/** The embed a note gets for a new sketch, as Obsidian would write it. */
export function sketchEmbed(link: EmbedLink): string {
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

/**
 * The embed in a paragraph of its own, with blank lines around it: on the
 * caret's line when that is empty, else after it. Offsets are the
 * editor's, as `hostDocuments.apply` takes them.
 */
export function sketchInsertion(
  source: string,
  caret: number | undefined,
  embed: string,
): TextEdit {
  const text = new SourceCoordinates(source).editor;
  const at = Math.min(Math.max(0, caret ?? text.length), text.length);
  const line = text.lineAt(at);
  const isBlank = (number: number) => text.line(number).text.trim() === "";
  const next = line.number < text.lines ? line.number + 1 : undefined;
  // What follows the embed: a blank line before more text, a final newline at the end.
  let after = "\n";
  if (next !== undefined) {
    after = isBlank(next) ? "" : "\n";
  }
  if (line.text.trim() === "") {
    const before = line.number > 1 && !isBlank(line.number - 1) ? "\n" : "";
    return {
      from: line.from,
      to: line.to,
      insert: `${before}${embed}${after}`,
    };
  }
  return { from: line.to, to: line.to, insert: `\n\n${embed}${after}` };
}
