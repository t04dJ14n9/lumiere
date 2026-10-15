import { createHash } from 'node:crypto';
import { mkdir, readdir, stat, unlink, utimes, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

const PNG_DATA_URL = 'data:image/png;base64,';
const MB = 1024 * 1024;
/** `pdfWorkshop.regionImageCache.maxSizeMB`: its default and its floor. */
const DEFAULT_MAX_MB = 100;
const MIN_MAX_MB = 1;

/** The snapshot cap, in bytes, from the setting's value in megabytes. */
export function regionCacheBytes(megabytes: unknown): number {
  const value = typeof megabytes === 'number' && Number.isFinite(megabytes) ? megabytes : DEFAULT_MAX_MB;
  return Math.max(value, MIN_MAX_MB) * MB;
}

/** A snapshot bigger than the whole cache: it is not saved at all. */
export class RegionTooLargeError extends Error {
  constructor(readonly bytes: number, readonly maxBytes: number) {
    super(`The region snapshot is ${megabytes(bytes)}, more than the ${megabytes(maxBytes)} snapshot limit (pdfWorkshop.regionImageCache.maxSizeMB)`);
    this.name = 'RegionTooLargeError';
  }
}

function megabytes(bytes: number): string {
  return `${(bytes / MB).toFixed(bytes < 10 * MB ? 1 : 0)} MB`;
}

/** The cache could not free enough room for a snapshot: nothing was written. */
export class RegionCacheFullError extends Error {
  constructor(readonly maxBytes: number, readonly causes: readonly unknown[]) {
    super(`Could not free enough room in the ${megabytes(maxBytes)} region snapshot cache: ${causes.map(describe).join('; ')}`);
    this.name = 'RegionCacheFullError';
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The file operations the cache uses; tests replace them to inject failures. */
export interface CacheFiles {
  unlink(file: string): Promise<void>;
  writeFile(file: string, bytes: Buffer): Promise<void>;
}

const nodeFiles: CacheFiles = { unlink, writeFile };

/**
 * PNG snapshots of selected regions, saved as files so an agent can open
 * them (and VS Code's chat can attach them). They live in the extension's
 * storage, not the workspace. A snapshot's modification time is when it was
 * last used: saving it, or saving it again to hand it to an agent.
 *
 * Invariant: as long as only this instance writes the folder (another VS
 * Code window's instance counts as someone else: each keeps to the cap for
 * what it can see, not for the two together), its PNGs
 * together never take more than the cap (`maxBytes`, read at every save so
 * a changed setting applies at once), at any instant, not only after a
 * save. Room is reclaimed before the new file is written: the least
 * recently used others are deleted, and only a deletion that succeeded (or
 * found the file already gone) counts as freed space. If not enough can be
 * freed, the save fails with RegionCacheFullError and writes nothing. A
 * snapshot larger than the cap on its own is rejected (RegionTooLargeError)
 * before anything is deleted. A write that fails is removed again.
 */
export class RegionImages {
  /** Saves run one at a time, so one save's pruning never deletes another's file. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly folder: string,
    private readonly maxBytes: () => number,
    private readonly files: CacheFiles = nodeFiles,
  ) {}

  /**
   * Save a region's snapshot (a PNG data URL) and return its path. Saving
   * the same snapshot again makes it the most recently used (and rewrites it
   * if it was deleted meanwhile).
   */
  save(pdfPath: string, page: number, image: string): Promise<string> {
    const saved = this.queue.then(() => this.write(pdfPath, page, image));
    this.queue = saved.catch(() => undefined);
    return saved;
  }

  private async write(pdfPath: string, page: number, image: string): Promise<string> {
    const bytes = Buffer.from(image.slice(PNG_DATA_URL.length), 'base64');
    const cap = this.maxBytes();
    if (bytes.length > cap) throw new RegionTooLargeError(bytes.length, cap);
    const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
    const file = path.join(this.folder, `${path.basename(pdfPath, '.pdf')}-p${page}-${hash}.png`);
    await mkdir(this.folder, { recursive: true });
    await this.reclaim(path.basename(file), cap - bytes.length, cap);
    try {
      await this.files.writeFile(file, bytes);
    } catch (error) {
      await this.files.unlink(file).catch(() => undefined);
      throw error;
    }
    // A rewrite with the same bytes may leave the time alone on some systems.
    const now = new Date();
    await utimes(file, now, now);
    return file;
  }

  /**
   * Delete the least recently used snapshots other than `target` until the
   * others take at most `room` bytes; throws RegionCacheFullError if they
   * cannot be brought down that far.
   */
  private async reclaim(target: string, room: number, cap: number): Promise<void> {
    const names = (await readdir(this.folder, { withFileTypes: true }))
      .filter(entry => entry.isFile() && entry.name.endsWith('.png') && entry.name !== target)
      .map(entry => entry.name);
    const images = (await Promise.all(names.map(async name => {
      const file = path.join(this.folder, name);
      const info = await stat(file).catch(() => undefined);
      return info ? { file, size: info.size, used: info.mtimeMs } : undefined;
    }))).filter(image => image !== undefined);
    let total = images.reduce((sum, image) => sum + image.size, 0);
    const failures: unknown[] = [];
    // Least recently used first.
    images.sort((a, b) => a.used - b.used);
    for (const image of images) {
      if (total <= room) return;
      try {
        await this.files.unlink(image.file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          failures.push(error);
          continue;
        }
      }
      total -= image.size;
    }
    if (total > room) throw new RegionCacheFullError(cap, failures);
  }
}
