/**
 * Insert Sketch: draw on a new canvas, save the drawing in the attachment
 * folder, and embed it in the note at the caret. Nothing is written until
 * the reader is done drawing; cancelling leaves the vault and the note as
 * they were.
 */
import { sketchToSvg } from "@workshop/ink/format";
import type { HostDocument, TextEdit } from "../../shared/host";
import { lookupKey } from "../../shared/vault-path";
import { joinContained } from "../../shared/workspace-path";
import { draw, type SketchHost } from "./edit";
import {
  attachmentFolder,
  sketchEmbed,
  sketchFileName,
  sketchInsertion,
  sketchStem,
  type EmbedLink,
} from "./placement";

export interface SketchNote {
  readonly document: HostDocument;
  /** The editor offset of the caret, when known; else the note's end. */
  readonly caret?: number;
  /** The note's link settings (Obsidian's Files and links). */
  readonly links: {
    readonly attachmentFolder: string;
    readonly useWikilinks: boolean;
    readonly format: EmbedLink["format"];
  };
}

export interface InsertHost extends SketchHost {
  readonly apply: (
    document: HostDocument,
    edits: readonly TextEdit[],
  ) => Promise<boolean>;
  readonly now: () => Date;
}

/** The new sketch's vault path once saved and embedded, else undefined. */
export async function insertSketch(
  host: InsertHost,
  note: SketchNote,
): Promise<string | undefined> {
  const located = await host.vaults.locate(note.document.uri);
  if (!located) {
    host.error("Sketches are saved in a vault: open this note from one.");
    return undefined;
  }
  const started = host.now();
  const drawn = await draw(host, { title: sketchStem(started) });
  if (!drawn) {
    return undefined;
  }
  const { index } = located.vault;
  const folder = attachmentFolder(note.links.attachmentFolder, located.path);
  const saved = await saveNew(host, {
    root: index.root,
    folder,
    name: (existing) => sketchFileName(started, existing),
    text: sketchToSvg(drawn),
  });
  if (!saved) {
    host.error(`The sketch could not be saved in ${folder || "the vault"}.`);
    return undefined;
  }
  const key = lookupKey(saved);
  const embed = sketchEmbed({
    path: saved,
    notePath: located.path,
    useWikilinks: note.links.useWikilinks,
    format: note.links.format,
    isNameUnique: !index
      .files()
      .some((file) => file.path !== saved && lookupKey(file.path) === key),
  });
  const edit = sketchInsertion(note.document.getText(), note.caret, embed);
  if (!(await host.apply(note.document, [edit]))) {
    host.error(
      `The sketch was saved as ${saved}, but the note could not be changed.`,
    );
  }
  return saved;
}

interface NewFile {
  /** The vault's root URI. */
  readonly root: string;
  /** The vault folder, "" for the root. */
  readonly folder: string;
  /** A name not among those the folder already has. */
  readonly name: (existing: readonly string[]) => string;
  readonly text: string;
}

/** Write a new file in a vault folder, made if missing; its vault path. */
async function saveNew(
  host: SketchHost,
  file: NewFile,
): Promise<string | undefined> {
  const folderUri = file.folder
    ? joinContained(file.root, file.folder)
    : file.root;
  if (!folderUri) {
    return undefined;
  }
  const existing = await host.files.list(folderUri);
  if (!existing) {
    await host.files.mkdir(folderUri);
  }
  const name = file.name(existing ?? []);
  const path = file.folder ? `${file.folder}/${name}` : name;
  const uri = joinContained(file.root, path);
  if (!uri) {
    return undefined;
  }
  await host.files.writeText(uri, file.text);
  return path;
}
