/**
 * Insert Sketch: draw on a new canvas, save the drawing in the attachment
 * folder, and embed it in the note at the caret. Nothing is written until
 * the reader is done drawing; cancelling leaves the vault and the note as
 * they were.
 */
import { sketchToSvg, SKETCH_EXTENSION } from "@workshop/ink/format";
import { embedFor, saveAttachment } from "../../attachments";
import type { HostDocument, TextEdit } from "../../shared/host";
import { lookupKey } from "../../shared/vault-path";
import type { VaultIndex } from "../vault/api";
import { draw, type SketchHost } from "./edit";
import { resolveAttachmentDir } from "../../attachments";
import {
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
  /** How long to wait for the vault's index to list the new file (ms). */
  readonly indexWait?: number;
}

/** Long enough for a host to report its own write; the embed goes in anyway after. */
const INDEX_WAIT_MS = 2000;

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
  const saved = await saveAttachment({
    files: host.files,
    root: index.root,
    notePath: located.path,
    attachmentFolder: note.links.attachmentFolder,
    useWikilinks: note.links.useWikilinks,
    format: note.links.format,
    ext: SKETCH_EXTENSION,
    text: sketchToSvg(drawn),
    now: started,
    vaultPaths: index.files().map((file) => file.path),
  });
  if (!saved) {
    const folder =
      resolveAttachmentDir(note.links.attachmentFolder, located.path) ||
      "the vault";
    host.error(`The sketch could not be saved in ${folder}.`);
    return undefined;
  }
  // The embed resolves through the index on its first render; a host
  // reports its own writes a moment later (host-web after a native stat).
  await whenIndexed(index, saved.path, host.indexWait ?? INDEX_WAIT_MS);
  const key = lookupKey(saved.path);
  const embed = embedFor({
    path: saved.path,
    notePath: located.path,
    useWikilinks: note.links.useWikilinks,
    format: note.links.format,
    isNameUnique: !index
      .files()
      .some((file) => file.path !== saved.path && lookupKey(file.path) === key),
  });
  const edit = sketchInsertion(note.document.getText(), note.caret, embed);
  if (!(await host.apply(note.document, [edit]))) {
    host.error(
      `The sketch was saved as ${saved.path}, but the note could not be changed.`,
    );
  }
  return saved.path;
}

/** Resolves once the index lists `path`, or after `ms` if it never does. */
function whenIndexed(
  index: VaultIndex,
  path: string,
  ms: number,
): Promise<void> {
  if (index.file(path)) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      void stop();
      resolve();
    };
    const timer = setTimeout(done, ms);
    const stop = index.onDidChange((change) => {
      if (change.path === path) {
        done();
      }
    });
  });
}
