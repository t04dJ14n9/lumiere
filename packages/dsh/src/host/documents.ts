/**
 * Notes as DSH has them: files on the host's disk. VS Code owns a note's text,
 * saving and undo; here this module does. A note's text lives in memory while
 * a panel shows it and is written back once typing pauses, as Obsidian does.
 */
import { createHash } from "node:crypto";
import { watch } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { Disposer } from "@workshop/core";
import {
  SourceCoordinates,
  type HostDocument,
  type HostDocuments,
  type SourceEdit,
  type TextEdit,
} from "@workshop/markdown/portable";

/** How long typing must pause before a note is written to disk. */
export const AUTOSAVE_DELAY_MS = 800;

type ChangeListener = (
  document: HostDocument,
  changes?: readonly SourceEdit[],
) => void;

/** One open note. Its text here is authoritative until written to disk. */
export class NoteDocument implements HostDocument {
  version = 1;
  isDirty = false;
  readonly isUntitled = false;
  /** The text as last read from or written to disk. */
  diskText: string;

  constructor(
    readonly uri: string,
    private text: string,
    private readonly saveNote: (note: NoteDocument) => Promise<boolean>,
  ) {
    this.diskText = text;
  }

  get id(): string {
    return this.uri;
  }

  get eol(): "\n" | "\r\n" {
    return this.text.includes("\r\n") ? "\r\n" : "\n";
  }

  getText(): string {
    return this.text;
  }

  save(): Promise<boolean> {
    return this.saveNote(this);
  }

  /** Apply non-overlapping source edits, last first, as one version. */
  replace(edits: readonly SourceEdit[]): void {
    let text = this.text;
    for (const edit of edits) {
      text = text.slice(0, edit.from) + edit.insert + text.slice(edit.to);
    }
    this.text = text;
    this.version += 1;
    this.isDirty = this.text !== this.diskText;
  }
}

/** Every open note, with the events the plugins and the vault listen to. */
export class NoteDocuments implements HostDocuments {
  private readonly notes = new Map<string, NoteDocument>();
  private readonly users = new Map<string, number>();
  private readonly watchers = new Map<string, () => void>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly saving = new Map<string, Promise<boolean>>();
  private readonly changeListeners = new Set<ChangeListener>();
  private readonly saveListeners = new Set<(note: HostDocument) => void>();
  private readonly willSave = new Set<(note: HostDocument) => Promise<void>>();
  private readonly closeListeners = new Set<(uri: string) => void>();

  constructor(private readonly delay = AUTOSAVE_DELAY_MS) {}

  fingerprint(text: string): string {
    return createHash("sha256").update(text).digest("hex");
  }

  async apply(
    document: HostDocument,
    edits: readonly TextEdit[],
  ): Promise<boolean> {
    const note = this.notes.get(document.uri);
    if (!note || note !== document) {
      return false;
    }
    const coordinates = new SourceCoordinates(note.getText());
    // Last first, so each range still refers to the text before the others.
    const changes = edits
      .map((edit) => ({
        from: coordinates.toSource(edit.from),
        to: coordinates.toSource(edit.to),
        insert: edit.insert,
      }))
      .sort((a, b) => b.from - a.from);
    note.replace(changes);
    this.emitChange(note, changes);
    this.scheduleSave(note);
    return true;
  }

  async open(uri: string): Promise<NoteDocument> {
    const open = this.notes.get(uri);
    if (open) {
      return open;
    }
    const text = await readFile(fileURLToPath(uri), "utf8");
    // Another open() may have finished while this one read the file.
    const raced = this.notes.get(uri);
    if (raced) {
      return raced;
    }
    const note = new NoteDocument(uri, text, (item) => this.save(item));
    this.notes.set(uri, note);
    this.watchers.set(uri, this.watchFile(note));
    return note;
  }

  /** A panel now shows the note; `release` when it stops. */
  retain(uri: string): void {
    this.users.set(uri, (this.users.get(uri) ?? 0) + 1);
  }

  /** The last panel showing the note closed: write it and forget it. */
  async release(uri: string): Promise<void> {
    const users = (this.users.get(uri) ?? 1) - 1;
    if (users > 0) {
      this.users.set(uri, users);
      return;
    }
    this.users.delete(uri);
    const note = this.notes.get(uri);
    if (note?.isDirty) {
      await this.save(note);
    }
    this.close(uri);
  }

  text(uri: string): string | undefined {
    return this.notes.get(uri)?.getText();
  }

  async rename(): Promise<void> {
    throw new Error("Renaming a note is not available in DeepSeek Harness yet");
  }

  onChange(listener: ChangeListener): Disposer {
    return subscribe(this.changeListeners, listener);
  }

  onSave(listener: (document: HostDocument) => void): Disposer {
    return subscribe(this.saveListeners, listener);
  }

  onWillSave(listener: (document: HostDocument) => Promise<void>): Disposer {
    return subscribe(this.willSave, listener);
  }

  /** DSH reports no renames, so there is nothing to update links for. */
  onWillRename(): Disposer {
    return () => {};
  }

  onClosed(listener: (uri: string) => void): Disposer {
    return subscribe(this.closeListeners, listener);
  }

  /**
   * Write every note with unsaved text, then stop watching files. Watches
   * close even when a write fails: an open watch keeps the host process alive.
   */
  async dispose(): Promise<void> {
    const writes = await Promise.allSettled(
      [...this.notes.values()]
        .filter((note) => note.isDirty)
        .map((note) => this.save(note)),
    );
    for (const uri of [...this.notes.keys()]) {
      this.close(uri);
    }
    const failed = writes.find((write) => write.status === "rejected");
    if (failed) {
      throw failed.reason;
    }
  }

  /** One write at a time per note; a save asked for during a write follows it. */
  save(note: NoteDocument): Promise<boolean> {
    const previous = this.saving.get(note.uri) ?? Promise.resolve(true);
    const next = previous.then(() => this.write(note));
    this.saving.set(note.uri, next);
    return next;
  }

  private async write(note: NoteDocument): Promise<boolean> {
    this.cancelSave(note.uri);
    await Promise.all([...this.willSave].map((listener) => listener(note)));
    const text = note.getText();
    await writeFile(fileURLToPath(note.uri), text, "utf8");
    note.diskText = text;
    note.isDirty = note.getText() !== text;
    for (const listener of this.saveListeners) {
      listener(note);
    }
    return true;
  }

  private scheduleSave(note: NoteDocument): void {
    this.cancelSave(note.uri);
    this.timers.set(
      note.uri,
      setTimeout(() => {
        this.timers.delete(note.uri);
        void this.save(note);
      }, this.delay),
    );
  }

  private cancelSave(uri: string): void {
    clearTimeout(this.timers.get(uri));
    this.timers.delete(uri);
  }

  private emitChange(note: NoteDocument, changes: readonly SourceEdit[]): void {
    for (const listener of this.changeListeners) {
      listener(note, changes);
    }
  }

  /**
   * Another program changed the file: take its text unless ours is unsaved.
   * The folder is watched, not the file: editors that save by renaming a new
   * file over the old one would end a watch on the file itself.
   */
  private watchFile(note: NoteDocument): () => void {
    const file = fileURLToPath(note.uri);
    const watcher = watch(path.dirname(file), (_event, name) => {
      if (name === null || name.toString() === path.basename(file)) {
        void this.reload(note);
      }
    });
    watcher.on("error", () => watcher.close());
    return () => watcher.close();
  }

  private async reload(note: NoteDocument): Promise<void> {
    let text: string;
    try {
      text = await readFile(fileURLToPath(note.uri), "utf8");
    } catch {
      return;
    }
    // Our own writes come back here; and unsaved typing wins over the disk.
    if (
      text === note.diskText ||
      note.isDirty ||
      this.notes.get(note.uri) !== note
    ) {
      return;
    }
    const change = { from: 0, to: note.getText().length, insert: text };
    note.diskText = text;
    note.replace([change]);
    this.emitChange(note, [change]);
  }

  private close(uri: string): void {
    this.cancelSave(uri);
    this.watchers.get(uri)?.();
    this.watchers.delete(uri);
    this.saving.delete(uri);
    if (this.notes.delete(uri)) {
      for (const listener of this.closeListeners) {
        listener(uri);
      }
    }
  }
}

function subscribe<T>(listeners: Set<T>, listener: T): Disposer {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
