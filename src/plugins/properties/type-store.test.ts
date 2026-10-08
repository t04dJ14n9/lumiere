import test from "node:test";
import assert from "node:assert/strict";
import { PropertyTypeStore } from "./type-store";
test("property type preferences serialize concurrent writes and stay within their vault", async () => {
  const saved = new Map<string, unknown>();
  const store = new PropertyTypeStore({
    get: <T>(key: string, fallback: T): T =>
      (saved.get(key) as T | undefined) ?? fallback,
    async update(key, value) {
      await Promise.resolve();
      saved.set(key, value);
    },
  });
  await Promise.all([
    store.set("vault-a", "Status", "checkbox"),
    store.set("vault-a", "due", "date"),
    store.set("vault-b", "status", "text"),
  ]);
  assert.deepEqual(store.read("vault-a"), { status: "checkbox", due: "date" });
  assert.deepEqual(store.read("vault-b"), { status: "text" });
  await store.set("vault-a", "status", null);
  assert.deepEqual(store.read("vault-a"), { due: "date" });
});
