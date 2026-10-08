import { isMarkdownPath } from "../../shared/vault-path";
import type { MemoryVaultIndex } from "./memory-index";
import type { VaultSnapshot } from "./snapshot";
import type { NoteParser, VaultFileSystem } from "./api";

export interface ParseQueueOptions {
  index: MemoryVaultIndex;
  snapshot: VaultSnapshot;
  fs: Pick<VaultFileSystem, "read">;
  parse: NoteParser;
  hash: (text: string) => string;
  /** Called after the snapshot changed, to schedule a save. */
  onSnapshotChanged: () => void;
  /** Called each time the queue drains. */
  onDrained: () => void;
  onError: (path: string, error: unknown) => void;
}

/**
 * Parses notes one at a time, so indexing never holds the extension host for
 * long. A note open in an editor is indexed from its unsaved text (the
 * overlay) instead of the file on disk.
 */
export class ParseQueue {
  private readonly pending = new Set<string>();
  private readonly overlays = new Map<string, string>();
  private running = false;
  private stopped = false;
  private drainWaiters: (() => void)[] = [];

  constructor(private readonly options: ParseQueueOptions) {}

  get isIdle(): boolean {
    return !this.running && this.pending.size === 0;
  }

  /** Re-read a note from disk (or its overlay). Non-notes are ignored. */
  enqueue(path: string): void {
    if (!isMarkdownPath(path) || this.stopped) {
      return;
    }
    this.pending.add(path);
    void this.run();
  }

  setOverlay(path: string, text: string): void {
    this.overlays.set(path, text);
    this.enqueue(path);
  }

  clearOverlay(path: string): void {
    if (this.overlays.delete(path)) {
      this.enqueue(path);
    }
  }

  /** Resolves when nothing is queued or running. */
  drained(): Promise<void> {
    if (this.isIdle) {
      return Promise.resolve();
    }
    return new Promise((resolve) => this.drainWaiters.push(resolve));
  }

  stop(): void {
    this.stopped = true;
    this.pending.clear();
  }

  private async run(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    for (const path of this.pending) {
      this.pending.delete(path);
      await this.parseOne(path);
      if (this.stopped) {
        break;
      }
    }
    this.running = false;
    this.options.onDrained();
    for (const resolve of this.drainWaiters.splice(0)) {
      resolve();
    }
  }

  private async parseOne(path: string): Promise<void> {
    const { index } = this.options;
    const file = index.file(path);
    if (!file) {
      return;
    }
    try {
      const overlay = this.overlays.get(path);
      const text = overlay ?? (await this.readText(file.uri));
      const hash = this.options.hash(text);
      const metadata = await this.metadataFor(hash, text);
      if (this.stopped || hasChanged(file, index.file(path))) {
        // A newer version of the file is already queued.
        return;
      }
      if (overlay === undefined) {
        this.options.snapshot.files[path] = {
          uri: file.uri,
          mtime: file.mtime,
          size: file.size,
          hash,
        };
        this.options.onSnapshotChanged();
      }
      index.setMetadata(path, metadata);
    } catch (error) {
      this.options.onError(path, error);
    }
  }

  private async readText(uri: string): Promise<string> {
    return new TextDecoder().decode(await this.options.fs.read(uri));
  }

  /** Identical text is parsed once, across files and sessions. */
  private async metadataFor(hash: string, text: string) {
    const { snapshot } = this.options;
    const known = snapshot.metadata[hash];
    if (known) {
      return known;
    }
    const metadata = await this.options.parse(text);
    snapshot.metadata[hash] = metadata;
    return metadata;
  }
}

function hasChanged(
  before: { mtime: number; size: number },
  after: { mtime: number; size: number } | undefined,
): boolean {
  return !after || after.mtime !== before.mtime || after.size !== before.size;
}
