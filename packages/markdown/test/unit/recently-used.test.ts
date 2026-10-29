import assert from "node:assert/strict";
import test from "node:test";
import { RecentlyUsed } from "../../src/shared/recently-used";

test("the least recently used entry goes first, reads counting as use", () => {
  const evicted: string[] = [];
  const cache = new RecentlyUsed<string, number>(2, (key) => evicted.push(key));
  cache.set("a", 1);
  cache.set("b", 2);
  assert.equal(cache.get("a"), 1);
  cache.set("c", 3);
  assert.deepEqual(evicted, ["b"]);
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.size, 2);
});

test("writing a key again refreshes it without evicting", () => {
  const evicted: string[] = [];
  const cache = new RecentlyUsed<string, number>(2, (key) => evicted.push(key));
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("a", 3);
  cache.set("c", 4);
  assert.deepEqual(evicted, ["b"]);
  assert.equal(cache.get("a"), 3);
});
