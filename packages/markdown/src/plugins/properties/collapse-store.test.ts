import test from "node:test";
import assert from "node:assert/strict";
import { PropertyCollapseStore } from "./collapse-store";
import { renderProperties } from "./sheet-html";

test("collapse state is per note, as in Obsidian: other notes stay open and a note keeps its state", async () => {
  const saved = new Map<string, unknown>();
  const storage = {
    get<T>(key: string, fallback: T): T {
      return (saved.get(key) as T) ?? fallback;
    },
    async update(key: string, value: unknown) {
      saved.set(key, value);
    },
  };
  const store = new PropertyCollapseStore(storage);
  const seen: [string, boolean][] = [];
  const stop = store.subscribe((note, collapsed) =>
    seen.push([note, collapsed]),
  );
  assert.equal(store.read("a.md"), false);
  await store.set("a.md", true);
  assert.equal(store.read("a.md"), true);
  assert.equal(store.read("b.md"), false);
  // A fresh store over the same storage (a reopened window) agrees.
  assert.equal(new PropertyCollapseStore(storage).read("a.md"), true);
  const note = "---\na: 1\n---\n";
  const collapsed = renderProperties(
    note,
    {},
    { collapsed: store.read("a.md") },
  );
  assert.match(collapsed, /metadata-container is-collapsed/);
  assert.match(collapsed, /aria-expanded="false"/);
  assert.doesNotMatch(
    renderProperties(note, {}, { collapsed: store.read("b.md") }),
    /is-collapsed/,
  );
  stop();
  await store.set("a.md", false);
  assert.deepEqual(seen, [["a.md", true]]);
  assert.deepEqual(saved.get("markdownPropertiesCollapsedNotes"), {});
});
