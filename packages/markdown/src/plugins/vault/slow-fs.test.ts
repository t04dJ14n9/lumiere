import test from "node:test";
import assert from "node:assert/strict";
import type { ListedFile } from "./api";
import { INITIAL_READY_BUDGET_MS, VaultIndexer } from "./indexer";
import { VaultRegistry } from "./registry";
import {
  indexerOptions,
  MemoryFileSystem,
  memorySystem,
} from "../../../test/unit/vault/memory-fs";

const ROOT = "memory:///vault";

function delayedList(
  list: (
    root: string,
    limit: number,
    shallow?: boolean,
  ) => Promise<{ files: ListedFile[]; partial: boolean }>,
  delayMs: number,
) {
  const finishers: (() => void)[] = [];
  const wrapped = (root: string, limit: number, shallow?: boolean) =>
    new Promise<{ files: ListedFile[]; partial: boolean }>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) {
          return;
        }
        done = true;
        clearTimeout(timer);
        resolve(list(root, limit, shallow));
      };
      const timer = setTimeout(finish, delayMs);
      timer.unref?.();
      finishers.push(finish);
    });
  return {
    list: wrapped,
    finishAll() {
      while (finishers.length > 0) {
        finishers.shift()?.();
      }
    },
  };
}

test("VaultIndexer.ready resolves within the initial budget when fs.list takes 15,000 ms", async () => {
  const fs = new MemoryFileSystem({
    "notes/guide.md": "# Guide\n\nSee [[notes/other]]",
    "notes/other.md": "# Other",
  });
  const slow = delayedList((root, limit) => fs.list(root, limit), 15_000);
  const startedAt = performance.now();
  const options = indexerOptions(fs);
  const indexer = new VaultIndexer({
    ...options,
    fs: {
      list: slow.list,
      read: (uri) => fs.read(uri),
      watch: (root, listener) => fs.watch(root, listener),
    },
  });

  await indexer.ready;
  const elapsedMs = performance.now() - startedAt;
  assert.ok(
    elapsedMs < 1_000,
    `expected ready in < 1,000 ms (budget ${INITIAL_READY_BUDGET_MS} ms), took ${Math.round(elapsedMs)} ms`,
  );

  // Seed the opened note while the 15,000 ms vault scan is still in flight.
  indexer.seedFile(`${ROOT}/notes/guide.md`, "notes/guide.md");
  assert.equal(indexer.index.file("notes/guide.md")?.path, "notes/guide.md");

  slow.finishAll();
  await indexer.settled();
  assert.deepEqual(
    indexer.index.files().map((file) => file.path),
    ["notes/guide.md", "notes/other.md"],
  );
  assert.equal(
    indexer.index.resolveLink("notes/other", "notes/guide.md")?.path,
    "notes/other.md",
  );
  await indexer.dispose();
});

test("VaultRegistry.forDocument seeds the opened note without waiting the ready budget on slow storage", async () => {
  const fs = new MemoryFileSystem({
    "notes/guide.md": "# Guide\n\nSee [[notes/other]]",
    "notes/other.md": "# Other",
  });
  const sys = memorySystem(fs);
  const slow = delayedList(sys.value.list, 15_000);
  const registry = new VaultRegistry(
    { ...sys.value, list: slow.list },
    { changed() {}, resolved() {}, error() {} },
  );

  const startedAt = performance.now();
  const vault = await registry.forDocument(`${ROOT}/notes/guide.md`);
  const elapsedMs = performance.now() - startedAt;
  // Critical open path must not sit on INITIAL_READY_BUDGET_MS (~500 ms).
  assert.ok(
    elapsedMs < 100,
    `expected forDocument in < 100 ms (no ready-budget wait), took ${Math.round(elapsedMs)} ms`,
  );
  assert.equal(vault.index.file("notes/guide.md")?.path, "notes/guide.md");

  // Loose notes also open immediately; listing finishes via settled().
  const looseStartedAt = performance.now();
  const loose = await registry.forDocument("memory:///loose-folder/readme.md");
  assert.ok(
    performance.now() - looseStartedAt < 100,
    `expected loose forDocument in < 100 ms, took ${Math.round(performance.now() - looseStartedAt)} ms`,
  );
  assert.equal(loose.index.file("readme.md")?.path, "readme.md");

  slow.finishAll();
  await vault.settled();
  await loose.settled();
  assert.deepEqual(
    vault.index.files().map((file) => file.path),
    ["notes/guide.md", "notes/other.md"],
  );
  await registry.dispose();
});
