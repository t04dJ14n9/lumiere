import type { NoteMetadata } from "../../markdown/metadata";

/**
 * The persisted index for one vault: what each file looked like when it was
 * parsed, and the metadata by content hash. A file whose time and size still
 * match is not read again at start-up; identical notes share one entry.
 */
export interface VaultSnapshot {
  version: typeof SNAPSHOT_VERSION;
  files: Record<string, CachedFile>;
  metadata: Record<string, NoteMetadata>;
}

export interface CachedFile {
  uri: string;
  mtime: number;
  size: number;
  /** Absent for files that are not parsed (attachments). */
  hash?: string;
}

/** Bump when NoteMetadata changes shape, so old caches are ignored. */
export const SNAPSHOT_VERSION = 1;

export function emptySnapshot(): VaultSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    files: Object.create(null) as Record<string, CachedFile>,
    metadata: Object.create(null) as Record<string, NoteMetadata>,
  };
}

/** Parse a stored snapshot; anything unreadable or from another version starts empty. */
export function readSnapshot(text: string | undefined): VaultSnapshot {
  if (!text) {
    return emptySnapshot();
  }
  try {
    const value = JSON.parse(text, reviveMaps) as Partial<VaultSnapshot>;
    if (
      value.version !== SNAPSHOT_VERSION ||
      !isRecord(value.files) ||
      !isRecord(value.metadata)
    ) {
      return emptySnapshot();
    }
    return Object.assign(emptySnapshot(), value);
  } catch {
    return emptySnapshot();
  }
}

/** Serialize, keeping only metadata that some file still refers to. */
export function writeSnapshot(snapshot: VaultSnapshot): string {
  const used = new Set(
    Object.values(snapshot.files).flatMap((file) =>
      file.hash ? [file.hash] : [],
    ),
  );
  const metadata = Object.fromEntries(
    Object.entries(snapshot.metadata).filter(([hash]) => used.has(hash)),
  );
  return JSON.stringify({ ...snapshot, metadata }, storeMaps);
}

/** Metadata holds Maps (footnote references); JSON would turn them into `{}`. */
function storeMaps(_key: string, value: unknown): unknown {
  return value instanceof Map ? { $map: [...value] } : value;
}

function reviveMaps(_key: string, value: unknown): unknown {
  if (isRecord(value) && Array.isArray(value.$map)) {
    return new Map(value.$map as [unknown, unknown][]);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
