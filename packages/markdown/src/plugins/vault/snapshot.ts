import type { NoteMetadata } from "../../markdown/metadata";
import type { SnapshotStore } from "./api";

export interface CachedFile {
  uri: string;
  mtime: number;
  size: number;
  /** Absent for files that are not parsed (attachments). */
  hash?: string;
}

/**
 * Bump when NoteMetadata, the packing or what the parser extracts changes, so
 * old caches are ignored: a cached note is only parsed again when its text
 * changes. 4: tags follow Obsidian 1.14.4's grammar. The digest pinned in
 * snapshot-version.test.ts fails when the parser's output changes.
 */
export const SNAPSHOT_VERSION = 4;
/** Metadata is split by hash into this many files, each parsed on its own turn. */
const SHARD_COUNT = 128;
const SHARDS = Array.from({ length: SHARD_COUNT }, (_, shard) => String(shard));
const FILES = "files";

/**
 * The persisted index for one vault: what each file looked like when it was
 * parsed (`files`), and parsed metadata by content hash (`metadata`). A file
 * whose time and size still match is not read again at start-up; identical
 * notes share one entry.
 *
 * Metadata is stored in 128 shards, so a large vault is loaded a piece at a
 * time without blocking the host, and a save rewrites only the shards that
 * changed. Positions are packed into arrays, which halves the size.
 */
export class Snapshot {
  readonly files: Record<string, CachedFile> = Object.create(null);
  readonly metadata: Record<string, NoteMetadata> = Object.create(null);
  private readonly dirty = new Set<string>();

  get isDirty(): boolean {
    return this.dirty.size > 0;
  }

  setFile(path: string, file: CachedFile): void {
    this.files[path] = file;
    this.dirty.add(FILES);
  }

  deleteFile(path: string): void {
    if (path in this.files) {
      delete this.files[path];
      this.dirty.add(FILES);
    }
  }

  setMetadata(hash: string, metadata: NoteMetadata): void {
    this.metadata[hash] = metadata;
    this.dirty.add(shardOf(hash));
  }

  async load(store: SnapshotStore): Promise<void> {
    const files = parse(await store.read(FILES));
    if (!isRecord(files) || files.version !== SNAPSHOT_VERSION) {
      return;
    }
    Object.assign(this.files, files.files);
    let sliceStart = Date.now();
    for (const shard of SHARDS) {
      const stored = parse(await store.read(`metadata-${shard}`));
      if (isRecord(stored) && stored.version === SNAPSHOT_VERSION) {
        Object.assign(this.metadata, unpack(stored.metadata));
      }
      if (Date.now() - sliceStart > 8) {
        await nextTurn();
        sliceStart = Date.now();
      }
    }
  }

  /** Write what changed since the last save, dropping unreferenced metadata. */
  async save(store: SnapshotStore): Promise<void> {
    const changed = new Set(this.dirty);
    this.dirty.clear();
    const used = new Set(
      Object.values(this.files).flatMap((file) =>
        file.hash ? [file.hash] : [],
      ),
    );
    const byShard = new Map<string, Record<string, NoteMetadata>>();
    for (const [hash, value] of Object.entries(this.metadata)) {
      const shard = shardOf(hash);
      if (!changed.has(shard)) {
        continue;
      }
      if (used.has(hash)) {
        let bucket = byShard.get(shard);
        if (!bucket) {
          bucket = {};
          byShard.set(shard, bucket);
        }
        bucket[hash] = value;
      } else {
        delete this.metadata[hash];
      }
    }
    let sliceStart = Date.now();
    for (const name of changed) {
      const file = name === FILES ? FILES : `metadata-${name}`;
      await store.write(file, this.serialize(name, byShard.get(name) ?? {}));
      if (Date.now() - sliceStart > 8) {
        await nextTurn();
        sliceStart = Date.now();
      }
    }
  }

  private serialize(
    name: string,
    metadata: Record<string, NoteMetadata>,
  ): string {
    if (name === FILES) {
      return JSON.stringify({ version: SNAPSHOT_VERSION, files: this.files });
    }
    return JSON.stringify({
      version: SNAPSHOT_VERSION,
      metadata: pack(metadata),
    });
  }
}

function shardOf(hash: string): string {
  const value = Number.parseInt(hash.slice(0, 2), 16);
  return String(Number.isNaN(value) ? 0 : value % SHARD_COUNT);
}

/** Let the host handle other events between shards. */
function nextTurn(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function parse(text: string | undefined): unknown {
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Prepare metadata for JSON: Maps (footnote references) become `{ $map }`,
 * and each `position` becomes `[startLine, startCol, startOffset, endLine,
 * endCol, endOffset]`.
 */
export function pack(value: unknown, key = ""): unknown {
  if (value instanceof Map) {
    return {
      $map: [...value].map(([entryKey, entry]) => [entryKey, pack(entry)]),
    };
  }
  if (Array.isArray(value)) {
    return value.map((item) => pack(item));
  }
  if (!isRecord(value)) {
    return value;
  }
  if (key === "position" && isRecord(value.start) && isRecord(value.end)) {
    const { start, end } = value as Record<string, Record<string, number>>;
    return [
      start!.line,
      start!.col,
      start!.offset,
      end!.line,
      end!.col,
      end!.offset,
    ];
  }
  const packed: Record<string, unknown> = {};
  for (const [field, item] of Object.entries(value)) {
    packed[field] = pack(item, field);
  }
  return packed;
}

/** The inverse of `pack`. */
export function unpack(value: unknown, key = ""): unknown {
  if (Array.isArray(value)) {
    if (key === "position" && value.length === 6) {
      const [line, col, offset, endLine, endCol, endOffset] = value as number[];
      return {
        start: { line, col, offset },
        end: { line: endLine, col: endCol, offset: endOffset },
      };
    }
    return value.map((item) => unpack(item));
  }
  if (!isRecord(value)) {
    return value;
  }
  if (Array.isArray(value.$map)) {
    return new Map(
      (value.$map as [unknown, unknown][]).map(([entryKey, entry]) => [
        entryKey,
        unpack(entry),
      ]),
    );
  }
  // Block IDs come from note text, so `blocks` keeps its null prototype, and
  // no key (not even `__proto__`) may set an object's prototype.
  const unpacked: Record<string, unknown> =
    key === "blocks" ? Object.create(null) : {};
  for (const [field, item] of Object.entries(value)) {
    const child = unpack(item, field);
    if (field === "__proto__") {
      Object.defineProperty(unpacked, field, {
        value: child,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    } else {
      unpacked[field] = child;
    }
  }
  return unpacked;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
