/**
 * Notes outside VS Code: files on the host's disk. VS Code owns a note's text,
 * saving and undo; here this module does. A note's text lives in memory while
 * a panel shows it and is written back once typing pauses, as Obsidian does.
 */
import type { Disposer } from "@workshop/core";
import {
  SourceCoordinates,
  type HostDocument,
  type HostDocuments,
  type SourceEdit,
  type TextEdit,
} from "@workshop/markdown/portable";
import type { HostFiles, HostPlatform } from "./platform";

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

/** What notes need from the platform: their files, and a hash of their text. */
export interface NoteFiles extends Pick<
  HostFiles,
  "readText" | "save" | "watch"
> {
  sha256(text: string): string;
}

export function noteFiles(platform: HostPlatform): NoteFiles {
  const { files } = platform;
  // Called through `files`: a platform's files may be a class instance.
  return {
    readText: (uri) => files.readText(uri),
    save: (uri, text) => files.save(uri, text),
    watch: (uri, listener) => files.watch(uri, listener),
    sha256: (text) => platform.sha256(text),
  };
}

/**
 * Whether a disk read should replace the open note. A read that started
 * before a save finished is stale: applying it would undo that save.
 */
export function diskReadReplacesNote(state: {
  text: string;
  diskText: string;
  dirty: boolean;
  open: boolean;
  writesAtStart: number;
  writesNow: number;
}): boolean {
  return (
    state.open &&
    !state.dirty &&
    state.writesAtStart === state.writesNow &&
    state.text !== state.diskText
  );
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
  private readonly saveFailedListeners = new Set<
    (uri: string, error: unknown) => void
  >();
  /** Saves that have reached disk. A reload captures this before it reads. */
  private readonly settledWrites = new Map<string, number>();

  constructor(
    private readonly files: NoteFiles,
    private readonly delay = AUTOSAVE_DELAY_MS,
  ) {}

  fingerprint(text: string): string {
    return this.files.sha256(text);
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
    const text = await this.readNote(uri);
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
    throw new Error("Renaming a note is not available here yet");
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

  /** No host reports renames here, so there is nothing to update links for. */
  onWillRename(): Disposer {
    return () => {};
  }

  onClosed(listener: (uri: string) => void): Disposer {
    return subscribe(this.closeListeners, listener);
  }

  /**
   * A save no one waited for (one made after typing paused) failed: the
   * note's text is still here, unsaved, and the reader must be told.
   */
  onSaveFailed(listener: (uri: string, error: unknown) => void): Disposer {
    return subscribe(this.saveFailedListeners, listener);
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
    await this.files.save(note.uri, text);
    // Count the save before publishing diskText, so a reload that resumes
    // in between still sees that its read is older than this write.
    this.settledWrites.set(
      note.uri,
      (this.settledWrites.get(note.uri) ?? 0) + 1,
    );
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
        this.save(note).catch((error: unknown) => {
          for (const listener of this.saveFailedListeners) {
            listener(note.uri, error);
          }
        });
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
   * (Platforms watch a file's folder: editors that save by renaming a new
   * file over the old one would end a watch on the file itself.)
   */
  private watchFile(note: NoteDocument): () => void {
    return this.files.watch(note.uri, () => void this.reload(note));
  }

  private async reload(note: NoteDocument): Promise<void> {
    const writesAtStart = this.settledWrites.get(note.uri) ?? 0;
    let text: string;
    try {
      text = await this.readNote(note.uri);
    } catch {
      return;
    }
    // Our own writes come back here; and unsaved typing wins over the disk.
    // A read that overlapped a save is dropped: it can still hold the old bytes.
    if (
      !diskReadReplacesNote({
        text,
        diskText: note.diskText,
        dirty: note.isDirty,
        open: this.notes.get(note.uri) === note,
        writesAtStart,
        writesNow: this.settledWrites.get(note.uri) ?? 0,
      })
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

  private readNote(uri: string): Promise<string> {
    return this.files.readText(uri);
  }
}

function subscribe<T>(listeners: Set<T>, listener: T): Disposer {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
