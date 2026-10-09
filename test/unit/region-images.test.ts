import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat, unlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { RegionCacheFullError, RegionImages, RegionTooLargeError, regionCacheBytes, type CacheFiles } from '../../src/extension/plugins/pdfRegions/region-images';

let folder: string;
beforeEach(async () => { folder = path.join(await mkdtemp(path.join(tmpdir(), 'region-images-')), 'regions'); });
afterEach(async () => { await rm(path.dirname(folder), { recursive: true, force: true }); });

/** A snapshot of `size` bytes; `seed` makes each one (and its file name) distinct. */
const png = (seed: number, size = 400): string => `data:image/png;base64,${Buffer.alloc(size, seed).toString('base64')}`;
const names = async (): Promise<string[]> => (await readdir(folder)).sort();
const usedSecondsAgo = (file: string, seconds: number): Promise<void> => {
  const time = new Date(Date.now() - seconds * 1000);
  return utimes(file, time, time);
};

test('a snapshot is saved under the PDF\'s name, page and content hash', async () => {
  const images = new RegionImages(folder, () => 1_000_000);
  const file = await images.save('/papers/attention.pdf', 9, png(1));
  assert.match(path.basename(file), /^attention-p9-[0-9a-f]{12}\.png$/);
  assert.equal(path.dirname(file), folder);
  assert.equal((await stat(file)).size, 400);
});

test('over the cap, the least recently used snapshots go first', async () => {
  const images = new RegionImages(folder, () => 1_000);
  const a = await images.save('/p.pdf', 1, png(1));
  const b = await images.save('/p.pdf', 1, png(2));
  await usedSecondsAgo(a, 30);
  await usedSecondsAgo(b, 20);
  // 1,200 bytes > 1,000: only the oldest, a, has to go.
  const c = await images.save('/p.pdf', 1, png(3));
  assert.deepEqual(await names(), [b, c].map(file => path.basename(file)).sort());
});

test('the folder never holds more than the cap', async () => {
  const images = new RegionImages(folder, () => 2_000);
  const saved: string[] = [];
  for (let seed = 1; seed <= 12; seed++) {
    saved.push(await images.save('/p.pdf', seed, png(seed, 300)));
    await usedSecondsAgo(saved.at(-1)!, 100 - seed);
    const sizes = await Promise.all((await readdir(folder)).map(async name => (await stat(path.join(folder, name))).size));
    assert.ok(sizes.reduce((sum, size) => sum + size, 0) <= 2_000);
  }
  // 300-byte files under a 2,000-byte cap: the newest six survive.
  assert.deepEqual(await names(), saved.slice(-6).map(file => path.basename(file)).sort());
});

test('saving the same region again makes it the most recently used', async () => {
  const images = new RegionImages(folder, () => 1_000);
  const a = await images.save('/p.pdf', 1, png(1));
  const b = await images.save('/p.pdf', 1, png(2));
  await usedSecondsAgo(a, 30);
  await usedSecondsAgo(b, 20);
  // Handing a to an agent again saves it again: same file, now the newest.
  assert.equal(await images.save('/p.pdf', 1, png(1)), a);
  assert.ok((await stat(a)).mtimeMs > Date.now() - 10_000);
  const c = await images.save('/p.pdf', 1, png(3));
  assert.deepEqual(await names(), [a, c].map(file => path.basename(file)).sort());
});

test('a re-saved snapshot that was already evicted is written again', async () => {
  const images = new RegionImages(folder, () => 500);
  const a = await images.save('/p.pdf', 1, png(1));
  await usedSecondsAgo(a, 30);
  await images.save('/p.pdf', 1, png(2));
  assert.deepEqual((await names()).includes(path.basename(a)), false);
  await images.save('/p.pdf', 1, png(1));
  assert.equal((await stat(a)).size, 400);
});

test('a changed cap applies from the next save', async () => {
  let cap = 1_000_000;
  const images = new RegionImages(folder, () => cap);
  const saved: string[] = [];
  for (let seed = 1; seed <= 5; seed++) {
    saved.push(await images.save('/p.pdf', 1, png(seed)));
    await usedSecondsAgo(saved.at(-1)!, 100 - seed);
  }
  assert.equal((await names()).length, 5);
  cap = 900;
  const last = await images.save('/p.pdf', 1, png(6));
  assert.deepEqual(await names(), [saved[4]!, last].map(file => path.basename(file)).sort());
});

test('only the PNG snapshots count toward the cap and are deleted', async () => {
  const images = new RegionImages(folder, () => 1_000);
  await images.save('/p.pdf', 1, png(1));
  const other = path.join(folder, 'notes.txt');
  await writeFile(other, Buffer.alloc(5_000));
  await usedSecondsAgo(other, 1_000);
  await images.save('/p.pdf', 1, png(2));
  assert.equal((await names()).length, 3);
});

test('saves made together never delete each other', async () => {
  // Room for exactly one 400-byte snapshot.
  const images = new RegionImages(folder, () => 400);
  const files = await Promise.all([1, 2, 3].map(seed => images.save('/p.pdf', 1, png(seed))));
  // Each save keeps its own file; the last one's prune leaves only it.
  assert.deepEqual(await names(), [path.basename(files[2]!)]);
});

test('the setting\'s contributed default is the default used in code: 100 MB', async () => {
  const manifest = JSON.parse(await readFile(path.join(import.meta.dirname, '../../package.json'), 'utf8')) as {
    contributes: { configuration: { properties: Record<string, { default?: unknown; minimum?: unknown }> } };
  };
  const setting = manifest.contributes.configuration.properties['vscodeEmbedPdf.regionImageCache.maxSizeMB'];
  assert.equal(setting?.default, 100);
  assert.equal(setting?.minimum, 1);
  assert.equal(regionCacheBytes(undefined), 100 * 1024 * 1024);
});

test('the cap setting is read in megabytes, with a default and a floor', () => {
  assert.equal(regionCacheBytes(50), 50 * 1024 * 1024);
  assert.equal(regionCacheBytes(2.5), 2.5 * 1024 * 1024);
  assert.equal(regionCacheBytes(undefined), 100 * 1024 * 1024);
  assert.equal(regionCacheBytes('10'), 100 * 1024 * 1024);
  assert.equal(regionCacheBytes(Number.NaN), 100 * 1024 * 1024);
  assert.equal(regionCacheBytes(0), 1024 * 1024);
  assert.equal(regionCacheBytes(-5), 1024 * 1024);
});

test('a snapshot larger than the whole cap is rejected and nothing is written or evicted', async () => {
  const images = new RegionImages(folder, () => 1_000);
  const kept = await images.save('/p.pdf', 1, png(1));
  await assert.rejects(images.save('/p.pdf', 2, png(2, 1_001)), (error: unknown) =>
    error instanceof RegionTooLargeError && error.bytes === 1_001 && error.maxBytes === 1_000);
  assert.deepEqual(await names(), [path.basename(kept)]);
  // The queue goes on after a rejection.
  const next = await images.save('/p.pdf', 3, png(3));
  assert.deepEqual(await names(), [kept, next].map(file => path.basename(file)).sort());
});

test('a snapshot exactly the size of the cap is kept, alone', async () => {
  const images = new RegionImages(folder, () => 1_000);
  await images.save('/p.pdf', 1, png(1));
  const whole = await images.save('/p.pdf', 2, png(2, 1_000));
  assert.deepEqual(await names(), [path.basename(whole)]);
});

/** The real file operations, except that deleting `failing` files fails with `code`. */
function failingUnlink(failing: (file: string) => boolean, code = 'EACCES'): CacheFiles {
  return {
    unlink: async file => {
      if (failing(file)) throw Object.assign(new Error(`${code}: cannot delete ${path.basename(file)}`), { code });
      await unlink(file);
    },
    writeFile: (file, bytes) => writeFile(file, bytes),
  };
}

const totalSize = async (): Promise<number> =>
  (await Promise.all((await readdir(folder)).map(async name => (await stat(path.join(folder, name))).size))).reduce((a, b) => a + b, 0);

test('a deletion that fails does not count as freed: the next one is tried, and the cap holds', async () => {
  let blocked = '';
  const images = new RegionImages(folder, () => 1_000, failingUnlink(file => file === blocked));
  const a = await images.save('/p.pdf', 1, png(1));
  const b = await images.save('/p.pdf', 1, png(2));
  await usedSecondsAgo(a, 30);
  await usedSecondsAgo(b, 20);
  blocked = a;
  // 1,200 > 1,000: a is oldest but cannot go, so b goes instead.
  const c = await images.save('/p.pdf', 1, png(3));
  assert.deepEqual(await names(), [a, c].map(file => path.basename(file)).sort());
  assert.ok(await totalSize() <= 1_000);
});

test('when not enough can be freed, the save fails and writes nothing; the cache stays within the cap', async () => {
  let blocked = false;
  const images = new RegionImages(folder, () => 1_000, failingUnlink(() => blocked));
  const a = await images.save('/p.pdf', 1, png(1));
  const b = await images.save('/p.pdf', 1, png(2));
  blocked = true;
  await assert.rejects(images.save('/p.pdf', 1, png(3)), (error: unknown) =>
    error instanceof RegionCacheFullError && /cannot delete/u.test(error.message));
  assert.deepEqual(await names(), [a, b].map(file => path.basename(file)).sort());
  assert.ok(await totalSize() <= 1_000);
});

test('a file already gone counts as freed', async () => {
  const images = new RegionImages(folder, () => 1_000, failingUnlink(() => true, 'ENOENT'));
  await images.save('/p.pdf', 1, png(1));
  await images.save('/p.pdf', 1, png(2));
  const c = await images.save('/p.pdf', 1, png(3));
  assert.ok((await names()).includes(path.basename(c)));
});

test('room is made before writing, so the cache never exceeds the cap even during a save', async () => {
  let peak = 0;
  const files: CacheFiles = {
    unlink: file => unlink(file),
    writeFile: async (file, bytes) => {
      peak = Math.max(peak, (await totalSize()) + bytes.length);
      await writeFile(file, bytes);
    },
  };
  const images = new RegionImages(folder, () => 1_000, files);
  for (let seed = 1; seed <= 6; seed++) {
    const file = await images.save('/p.pdf', seed, png(seed));
    await usedSecondsAgo(file, 100 - seed);
  }
  assert.ok(peak > 0 && peak <= 1_000, `peak ${peak}`);
});

test('a write that fails is removed and reported', async () => {
  const files: CacheFiles = {
    unlink: file => unlink(file),
    writeFile: async file => {
      await writeFile(file, Buffer.alloc(10));
      throw new Error('disk full');
    },
  };
  const images = new RegionImages(folder, () => 1_000, files);
  await assert.rejects(images.save('/p.pdf', 1, png(1)), /disk full/u);
  assert.deepEqual(await names(), []);
});
