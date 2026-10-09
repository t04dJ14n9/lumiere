import { createHash } from 'node:crypto';
import { mkdir, readdir, stat, unlink, utimes, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

const PNG_DATA_URL = 'data:image/png;base64,';
const MB = 1024 * 1024;
/** `vscodeEmbedPdf.regionImageCache.maxSizeMB`: its default and its floor. */
const DEFAULT_MAX_MB = 50;
const MIN_MAX_MB = 1;

/** The snapshot cap, in bytes, from the setting's value in megabytes. */
export function regionCacheBytes(megabytes: unknown): number {
  const value = typeof megabytes === 'number' && Number.isFinite(megabytes) ? megabytes : DEFAULT_MAX_MB;
  return Math.max(value, MIN_MAX_MB) * MB;
}

/**
 * PNG snapshots of selected regions, saved as files so an agent can open
 * them (and VS Code's chat can attach them). They live in the extension's
 * storage, not the workspace. A snapshot's modification time is when it was
 * last used: saving it, or saving it again to hand it to an agent. When the
 * PNGs together pass the cap (`maxBytes`, read at every save so a changed
 * setting applies at once), the least recently used are deleted until they
 * fit; the snapshot just saved is always kept.
 */
export class RegionImages {
  /** Saves run one at a time, so one save's pruning never deletes another's file. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly folder: string,
    private readonly maxBytes: () => number,
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
    const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
    const file = path.join(this.folder, `${path.basename(pdfPath, '.pdf')}-p${page}-${hash}.png`);
    await mkdir(this.folder, { recursive: true });
    await writeFile(file, bytes);
    // A rewrite with the same bytes may leave the time alone on some systems.
    const now = new Date();
    await utimes(file, now, now);
    await this.prune(path.basename(file));
    return file;
  }

  private async prune(keep: string): Promise<void> {
    const names = (await readdir(this.folder, { withFileTypes: true }))
      .filter(entry => entry.isFile() && entry.name.endsWith('.png'))
      .map(entry => entry.name);
    const images = (await Promise.all(names.map(async name => {
      const file = path.join(this.folder, name);
      const info = await stat(file).catch(() => undefined);
      return info ? { name, file, size: info.size, used: info.mtimeMs } : undefined;
    }))).filter(image => image !== undefined);
    let total = images.reduce((sum, image) => sum + image.size, 0);
    const cap = this.maxBytes();
    // Least recently used first.
    images.sort((a, b) => a.used - b.used);
    for (const image of images) {
      if (total <= cap) break;
      if (image.name === keep) continue;
      await unlink(image.file).catch(() => undefined);
      total -= image.size;
    }
  }
}
