/**
 * Where a new sketch goes and how the note links to it. Thin wrappers over
 * the shared attachment core so sketches share Obsidian's folder, naming and
 * embed rules with paste/drop attachments.
 */
import { SKETCH_EXTENSION } from "@workshop/ink/format";
import {
  embedFor,
  insertEmbed,
  resolveAttachmentDir,
  timestampStem,
  uniqueTimestampName,
  type EmbedLink,
} from "../../attachments";
import type { TextEdit } from "../../shared/host";

export type { EmbedLink };

/** @deprecated Prefer resolveAttachmentDir from attachments. */
export function attachmentFolder(setting: string, notePath: string): string {
  return resolveAttachmentDir(setting, notePath);
}

/** A sketch's name from when it was drawn: `2026-10-22 14.03`, local time. */
export function sketchStem(date: Date): string {
  return timestampStem(date);
}

/**
 * A new sketch's file name, not taken in its folder (compared without
 * case): `2026-10-22 14.03 2` for the second in a minute.
 */
export function sketchFileName(
  date: Date,
  existing: readonly string[],
): string {
  return uniqueTimestampName(SKETCH_EXTENSION, existing, date);
}

/** The embed a note gets for a new sketch, as Obsidian would write it. */
export function sketchEmbed(link: EmbedLink): string {
  return embedFor(link);
}

/**
 * The embed in a paragraph of its own, with blank lines around it: on the
 * caret's line when that is empty, else after it.
 */
export function sketchInsertion(
  source: string,
  caret: number | undefined,
  embed: string,
): TextEdit {
  return insertEmbed(source, caret, embed);
}
