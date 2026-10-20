import test from "node:test";
import assert from "node:assert/strict";
import {
  RECENT_KEY,
  readRecent,
  rememberOpen,
} from "../../../src/plugins/quickSwitcher/recent";

function memoryStorage(initial: Record<string, unknown> = {}) {
  const data = { ...initial };
  return {
    get<T>(key: string, fallback: T): T {
      return (key in data ? data[key] : fallback) as T;
    },
    async update(key: string, value: unknown) {
      data[key] = value;
    },
    data,
  };
}

test("rememberOpen records md URIs newest first and drops duplicates", async () => {
  const storage = memoryStorage();
  await rememberOpen(storage, "file:///vault/A.md");
  await rememberOpen(storage, "file:///vault/B.md");
  await rememberOpen(storage, "file:///vault/A.md");
  assert.deepEqual(readRecent(storage), [
    "file:///vault/A.md",
    "file:///vault/B.md",
  ]);
  assert.deepEqual(storage.data[RECENT_KEY], readRecent(storage));
});

test("rememberOpen ignores non-markdown targets", async () => {
  const storage = memoryStorage();
  await rememberOpen(storage, "file:///vault/image.png");
  assert.deepEqual(readRecent(storage), []);
});
