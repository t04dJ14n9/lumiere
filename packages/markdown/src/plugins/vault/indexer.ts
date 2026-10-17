import type { Disposer } from "@workshop/core";
import { isMarkdownPath } from "../../shared/vault-path";
import { exclusionMatcher, isIgnoredPath } from "./exclusion";
import type { FileEntry } from "./file-table";
import { MemoryVaultIndex } from "./memory-index";
import { ParseQueue } from "./parse-queue";
import { Snapshot } from "./snapshot";
import type {
  FileEvent,
  ListedFile,
  NoteParser,
  SnapshotStore,
  VaultFileSystem,
  VaultSettings,
} from "./api";

/** Obsidian's limit is higher; past this the index says it is partial. */
export const FILE_LIMIT = 50_000;
/** At most one snapshot write per interval (DESIGN §12.2). */
const SAVE_DELAY_MS = 2_000;
/** Typing in an open note re-indexes it after this pause. */
const OVERLAY_DELAY_MS = 300;
/** Long start-up work runs in slices of about this long, between other events. */
const SLICE_MS = 8;

export interface IndexerOptions {
  root: string;
  fs: VaultFileSystem;
  store?: SnapshotStore;
  parse: NoteParser;
  hash: (text: string) => string;
  settings: () => VaultSettings;
  /** Called each time indexing settles (Obsidian's `resolved`). */
  onResolved?: () => void;
  onPartial?: () => void;
  onError?: (message: string, error: unknown) => void;
  delays?: { save: number; overlay: number };
}

/**
 * Keeps one vault's index current: it starts from the persisted snapshot,
 * reconciles it with the file system, follows file events and open editors,
 * and saves the snapshot again.
 */
export class VaultIndexer {
  readonly index: MemoryVaultIndex;
  /** Resolves once the file list is known, from the snapshot or a listing. */
  readonly ready: Promise<void>;
  private readonly queue: ParseQueue;
  private readonly snapshot = new Snapshot();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private stopWatching?: Disposer;
  private disposed = false;
  private isExcluded: (path: string) => boolean;
  /** The first comparison with the file system, which may run after `ready`. */
  private reconciled: Promise<void> = Promise.resolve();

  constructor(private readonly options: IndexerOptions) {
    const { folderNote, linkFormat, excludedFiles } = options.settings();
    this.isExcluded = exclusionMatcher(excludedFiles);
    this.index = new MemoryVaultIndex({
      root: options.root,
      folderNote,
      linkFormat,
    });
    this.queue = this.createQueue();
    this.ready = this.start();
  }

  /** Resolves when the file system has been listed and no note waits to be parsed. */
  async settled(): Promise<void> {
    await this.ready;
    await this.reconciled;
    await this.queue.drained();
  }

  /** The unsaved text of an open note, indexed after a short pause. */
  setOverlay(path: string, text: string): void {
    this.debounce(`overlay:${path}`, this.delays.overlay, () =>
      this.queue.setOverlay(path, text),
    );
  }

  /** The note was closed; its file on disk is authoritative again. */
  clearOverlay(path: string): void {
    this.cancel(`overlay:${path}`);
    this.queue.clearOverlay(path);
  }

  /** Settings changed: apply exclusion and link settings to every file. */
  applySettings(): void {
    const settings = this.options.settings();
    this.index.configure(settings);
    this.isExcluded = exclusionMatcher(settings.excludedFiles);
    this.index.replaceFiles(this.index.files().map((file) => this.entry(file)));
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    void this.queue.stop();
    void this.stopWatching?.();
    for (const key of [...this.timers.keys()]) {
      this.cancel(key);
    }
    await this.save();
  }

  private get delays() {
    return (
      this.options.delays ?? { save: SAVE_DELAY_MS, overlay: OVERLAY_DELAY_MS }
    );
  }

  private createQueue(): ParseQueue {
    return new ParseQueue({
      index: this.index,
      snapshot: this.snapshot,
      fs: this.options.fs,
      parse: this.options.parse,
      hash: this.options.hash,
      onSnapshotChanged: () => this.scheduleSave(),
      onDrained: () => this.drained(),
      onError: (path, error) =>
        this.options.onError?.(`Could not index ${path}`, error),
    });
  }

  private async start(): Promise<void> {
    if (this.options.store) {
      await this.snapshot.load(this.options.store);
    }
    const hasCachedFiles = Object.keys(this.snapshot.files).length > 0;
    if (hasCachedFiles) {
      await this.loadCached();
      this.reconciled = this.reconcile().catch((error) =>
        this.options.onError?.("Could not list the vault", error),
      );
      return;
    }
    this.reconciled = this.reconcile();
    await this.reconciled;
  }

  /**
   * Warm start: the previous session's files and metadata, before any
   * listing. Metadata is added in short slices so the host stays responsive.
   */
  private async loadCached(): Promise<void> {
    const cached = Object.entries(this.snapshot.files);
    await inSlices(cached, ([path, file]) =>
      this.index.addFiles([
        this.entry({ uri: file.uri, path, mtime: file.mtime, size: file.size }),
      ]),
    );
    await inSlices(cached, ([path, file]) => {
      const metadata = file.hash
        ? this.snapshot.metadata[file.hash]
        : undefined;
      if (metadata) {
        this.index.setMetadata(path, metadata);
      }
    });
  }

  /** Compare the file system with the index; parse only what changed. */
  private async reconcile(): Promise<void> {
    const listing = await this.options.fs.list(this.options.root, FILE_LIMIT);
    if (this.disposed) {
      return;
    }
    if (listing.partial) {
      this.options.onPartial?.();
    }
    this.stopWatching = this.options.fs.watch(this.options.root, (event) =>
      this.onFileEvent(event),
    );
    const files = listing.files.filter((file) => !isIgnoredPath(file.path));
    const present = new Set(files.map((file) => file.path));
    this.index.removeFilesExcept(present);
    this.forgetMissing(present);
    await inSlices(files, (file) => {
      this.index.addFiles([this.entry(file)]);
      if (this.needsParse(file)) {
        this.queue.enqueue(file.path);
      }
    });
    if (this.queue.isIdle) {
      this.drained();
    }
  }

  /**
   * Whether a note must be read and parsed. A note whose time and size match
   * the snapshot reuses its metadata. Attachments are only recorded.
   */
  private needsParse(file: ListedFile): boolean {
    const cached = this.snapshot.files[file.path];
    const isSame = cached?.mtime === file.mtime && cached.size === file.size;
    if (!isMarkdownPath(file.path)) {
      if (!isSame) {
        this.snapshot.setFile(file.path, { ...file });
        this.scheduleSave();
      }
      return false;
    }
    const metadata = cached?.hash && this.snapshot.metadata[cached.hash];
    if (!isSame || !metadata) {
      return true;
    }
    if (!this.index.metadata(file.path)) {
      this.index.setMetadata(file.path, metadata);
    }
    return false;
  }

  private forgetMissing(present: Set<string>): void {
    for (const path of Object.keys(this.snapshot.files)) {
      if (!present.has(path)) {
        this.snapshot.deleteFile(path);
        this.scheduleSave();
      }
    }
  }

  private onFileEvent(event: FileEvent): void {
    if (event.type === "delete") {
      this.deletePath(event.path);
      return;
    }
    if (isIgnoredPath(event.file.path)) {
      return;
    }
    if (event.type === "rename") {
      this.index.renameFile(event.oldPath, this.entry(event.file));
      this.moveCached(event.oldPath, event.file);
    } else {
      this.index.upsertFile(this.entry(event.file));
    }
    if (this.needsParse(event.file)) {
      this.queue.enqueue(event.file.path);
    }
  }

  /** VS Code reports a deleted folder by itself; its files go with it. */
  private deletePath(path: string): void {
    const isFile = Boolean(this.index.file(path));
    const prefix = path + "/";
    const paths = isFile
      ? [path]
      : this.index
          .files()
          .map((file) => file.path)
          .filter((other) => other.startsWith(prefix));
    for (const deleted of paths) {
      this.index.deleteFile(deleted);
      this.snapshot.deleteFile(deleted);
    }
    this.scheduleSave();
  }

  /** A renamed file keeps its parsed metadata; only its record moves. */
  private moveCached(oldPath: string, file: ListedFile): void {
    const cached = this.snapshot.files[oldPath];
    this.snapshot.deleteFile(oldPath);
    if (cached) {
      this.snapshot.setFile(file.path, { ...cached, uri: file.uri });
    }
    this.scheduleSave();
  }

  private entry(file: ListedFile): FileEntry {
    return {
      uri: file.uri,
      path: file.path,
      mtime: file.mtime,
      size: file.size,
      excluded: this.isExcluded(file.path),
    };
  }

  private drained(): void {
    if (this.disposed) {
      return;
    }
    this.index.notifyResolved();
    this.options.onResolved?.();
  }

  private scheduleSave(): void {
    if (!this.options.store || this.timers.has("save")) {
      return;
    }
    this.debounce("save", this.delays.save, () => void this.save());
  }

  private async save(): Promise<void> {
    this.cancel("save");
    if (!this.options.store || !this.snapshot.isDirty) {
      return;
    }
    try {
      await this.snapshot.save(this.options.store);
    } catch (error) {
      this.options.onError?.("Could not save the vault index", error);
    }
  }

  private debounce(key: string, delay: number, run: () => void): void {
    this.cancel(key);
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        run();
      }, delay),
    );
  }

  private cancel(key: string): void {
    clearTimeout(this.timers.get(key));
    this.timers.delete(key);
  }
}

/** Run `step` over items, yielding to other events every few milliseconds. */
async function inSlices<T>(
  items: readonly T[],
  step: (item: T) => void,
): Promise<void> {
  let sliceStart = Date.now();
  for (const item of items) {
    step(item);
    if (Date.now() - sliceStart > SLICE_MS) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      sliceStart = Date.now();
    }
  }
}
