/**
 * Write attachment bytes into the vault's attachment folder under a unique
 * timestamp name. Callers supply the note's vault path and link settings so
 * the returned embed matches sketch / Obsidian rules.
 */
import { lookupKey } from "../shared/vault-path";
import { joinContained } from "../shared/workspace-path";
import type { WorkspaceFiles } from "../shared/workspace-files";
import { embedFor, type EmbedLink } from "./embed";
import { resolveAttachmentDir } from "./folder";
import { uniqueTimestampName } from "./naming";

export interface SaveAttachmentInput {
  readonly files: Pick<
    WorkspaceFiles,
    "list" | "mkdir" | "writeText" | "writeBytes"
  >;
  /** The vault's root URI. */
  readonly root: string;
  /** The note's vault-relative path. */
  readonly notePath: string;
  readonly attachmentFolder: string;
  readonly useWikilinks: boolean;
  readonly format: EmbedLink["format"];
  /** Extension without a required leading dot (`png`, `sketch.svg`). */
  readonly ext: string;
  readonly bytes?: Uint8Array;
  readonly text?: string;
  readonly now?: Date;
  /** Existing vault paths, for shortest-link uniqueness. */
  readonly vaultPaths?: readonly string[];
}

export interface SavedAttachment {
  /** Vault-relative path of the written file. */
  readonly path: string;
  /** Embed markdown/wikilink to insert in the note. */
  readonly embed: string;
}

/** Write one attachment; undefined when the folder or write fails containment. */
export async function saveAttachment(
  input: SaveAttachmentInput,
): Promise<SavedAttachment | undefined> {
  const folder = resolveAttachmentDir(input.attachmentFolder, input.notePath);
  const folderUri = folder ? joinContained(input.root, folder) : input.root;
  if (!folderUri) {
    return undefined;
  }
  const existing = await input.files.list(folderUri);
  if (!existing) {
    await input.files.mkdir(folderUri);
  }
  const name = uniqueTimestampName(input.ext, existing ?? [], input.now);
  const path = folder ? `${folder}/${name}` : name;
  const uri = joinContained(input.root, path);
  if (!uri) {
    return undefined;
  }
  if (input.bytes) {
    await input.files.writeBytes(uri, input.bytes);
  } else if (typeof input.text === "string") {
    await input.files.writeText(uri, input.text);
  } else {
    return undefined;
  }
  const key = lookupKey(path);
  const vaultPaths = input.vaultPaths ?? [];
  const isNameUnique = !vaultPaths.some(
    (other) => other !== path && lookupKey(other) === key,
  );
  return {
    path,
    embed: embedFor({
      path,
      notePath: input.notePath,
      useWikilinks: input.useWikilinks,
      format: input.format,
      isNameUnique,
    }),
  };
}
