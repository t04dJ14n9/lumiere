import { createHash } from "node:crypto";
import { metadata } from "../../../src/markdown/metadata";
import type { IndexerOptions } from "../../../src/plugins/vault/indexer";
import type {
  FileEvent,
  ListedFile,
  VaultFileSystem,
  VaultSettings,
} from "../../../src/plugins/vault/api";

/** An in-memory vault with the file events and counters tests need. */
export class MemoryFileSystem implements VaultFileSystem {
  readonly texts = new Map<string, string>();
  readonly mtimes = new Map<string, number>();
  reads = 0;
  listings = 0;
  limit = Infinity;
  /** When set, listing waits until the test releases it. */
  gate?: Promise<void>;
  private listener?: (event: FileEvent) => void;
  private clock = 1;

  constructor(files: Record<string, string> = {}) {
    for (const [path, text] of Object.entries(files)) {
      this.put(path, text);
    }
  }

  put(path: string, text: string): ListedFile {
    this.texts.set(path, text);
    this.mtimes.set(path, this.clock++);
    return this.listed(path);
  }

  listed(path: string): ListedFile {
    return {
      uri: `memory:///vault/${path}`,
      path,
      mtime: this.mtimes.get(path)!,
      size: this.texts.get(path)!.length,
    };
  }

  async list(_root: string, limit: number) {
    this.listings++;
    await this.gate;
    const paths = [...this.texts.keys()];
    const max = Math.min(limit, this.limit);
    return {
      files: paths.slice(0, max).map((path) => this.listed(path)),
      partial: paths.length > max,
    };
  }

  async read(uri: string): Promise<Uint8Array> {
    this.reads++;
    const path = uri.replace("memory:///vault/", "");
    const text = this.texts.get(path);
    if (text === undefined) {
      throw new Error(`No file ${path}`);
    }
    return new TextEncoder().encode(text);
  }

  watch(_root: string, listener: (event: FileEvent) => void) {
    this.listener = listener;
    return () => {
      this.listener = undefined;
    };
  }

  /** Change the file system and report it, as a watcher would. */
  emit(event: FileEvent): void {
    this.listener?.(event);
  }

  create(path: string, text: string): void {
    this.emit({ type: "create", file: this.put(path, text) });
  }

  change(path: string, text: string): void {
    this.emit({ type: "change", file: this.put(path, text) });
  }

  delete(path: string): void {
    this.texts.delete(path);
    this.mtimes.delete(path);
    this.emit({ type: "delete", path });
  }

  rename(oldPath: string, path: string): void {
    const text = this.texts.get(oldPath)!;
    const mtime = this.mtimes.get(oldPath)!;
    this.texts.delete(oldPath);
    this.mtimes.delete(oldPath);
    this.texts.set(path, text);
    this.mtimes.set(path, mtime);
    this.emit({ type: "rename", oldPath, file: this.listed(path) });
  }
}

export class MemoryStore {
  text?: string;
  writes = 0;
  async read() {
    return this.text;
  }
  async write(text: string) {
    this.writes++;
    this.text = text;
  }
}

export function indexerOptions(
  fs: MemoryFileSystem,
  overrides: Partial<Omit<IndexerOptions, "settings">> & {
    settings?: Partial<VaultSettings>;
  } = {},
): IndexerOptions & { parses: () => number } {
  let parses = 0;
  const settings: VaultSettings = {
    folderNote: "",
    linkFormat: "shortest",
    excludedFiles: [],
    rootMarkers: [".obsidian"],
    ...overrides.settings,
  };
  return {
    root: "memory:///vault",
    fs,
    parse: async (text) => {
      parses++;
      return metadata(text);
    },
    hash: (text) => createHash("sha256").update(text).digest("hex"),
    delays: { save: 1, overlay: 1 },
    ...overrides,
    settings: () => settings,
    parses: () => parses,
  };
}

export const wait = (ms = 10) =>
  new Promise((resolve) => setTimeout(resolve, ms));
