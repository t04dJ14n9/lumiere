import test from "node:test";
import assert from "node:assert/strict";
import { PropertyCollapseStore } from "./collapse-store";
import { renderProperties } from "./sheet-html";

test("collapse preference is shared by notes/panels and survives reopening without a vault key", async () => {
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
  const panels: boolean[][] = [[], []];
  const stop = store.subscribe((value) => panels[0]!.push(value));
  store.subscribe((value) => panels[1]!.push(value));
  assert.equal(store.read(), false);
  await store.set(true);
  assert.equal(new PropertyCollapseStore(storage).read(), true);
  for (const note of ["---\na: 1\n---\n", "---\nb: two\n---\n"]) {
    const html = renderProperties(note, {}, { collapsed: store.read() });
    assert.match(html, /metadata-container is-collapsed/);
    assert.match(html, /metadata-content" hidden/);
    assert.match(html, /aria-expanded="false"/);
  }
  stop();
  await store.set(false);
  assert.deepEqual(panels, [[true], [true, false]]);
  assert.equal(new PropertyCollapseStore(storage).read(), false);
});
