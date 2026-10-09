import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { RegionImages, regionCacheBytes } from '../../src/extension/region-images';

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

test('the snapshot just saved is kept even when it alone is over the cap', async () => {
  const images = new RegionImages(folder, () => 100);
  await images.save('/p.pdf', 1, png(1));
  const big = await images.save('/p.pdf', 2, png(2, 500));
  assert.deepEqual(await names(), [path.basename(big)]);
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
  const images = new RegionImages(folder, () => 100);
  const files = await Promise.all([1, 2, 3].map(seed => images.save('/p.pdf', 1, png(seed))));
  // Each save keeps its own file; the last one's prune leaves only it.
  assert.deepEqual(await names(), [path.basename(files[2]!)]);
});

test('the cap setting is read in megabytes, with a default and a floor', () => {
  assert.equal(regionCacheBytes(50), 50 * 1024 * 1024);
  assert.equal(regionCacheBytes(2.5), 2.5 * 1024 * 1024);
  assert.equal(regionCacheBytes(undefined), 50 * 1024 * 1024);
  assert.equal(regionCacheBytes('10'), 50 * 1024 * 1024);
  assert.equal(regionCacheBytes(Number.NaN), 50 * 1024 * 1024);
  assert.equal(regionCacheBytes(0), 1024 * 1024);
  assert.equal(regionCacheBytes(-5), 1024 * 1024);
});
