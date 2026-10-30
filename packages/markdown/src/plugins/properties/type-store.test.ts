import test from "node:test";
import assert from "node:assert/strict";
import { PropertyTypeStore } from "./type-store";
import { inferPropertyKind } from "../../markdown/properties/types";
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

test("the name registry survives reopening and Automatic restores value inference in every note", async () => {
  const saved = new Map<string, unknown>();
  const storage = {
    get<T>(key: string, fallback: T): T {
      return (saved.get(key) as T) ?? fallback;
    },
    async update(key: string, value: unknown) {
      saved.set(key, value);
    },
  };
  const store = new PropertyTypeStore(storage);
  await store.set("vault-a", "Status", "text");
  const reopened = new PropertyTypeStore(storage);
  assert.deepEqual(reopened.read("vault-a"), { status: "text" });
  for (const noteValue of [3, true, ["done"]]) {
    assert.equal(
      inferPropertyKind("status", noteValue, reopened.read("vault-a")),
      "text",
    );
  }
  assert.deepEqual(reopened.read("vault-b"), {});
  await reopened.set("vault-a", "STATUS", null);
  assert.deepEqual(store.read("vault-a"), {});
  for (const key of ["tags", "Aliases", "cssclasses", "sources"]) {
    await assert.rejects(store.set("vault-a", key, "number"));
    await assert.rejects(store.set("vault-a", key, null));
  }
  assert.deepEqual(store.read("vault-a"), {});
});

test("preference subscriptions notify separate panel consumers only until disposed", async () => {
  const saved = new Map<string, unknown>();
  const store = new PropertyTypeStore({
    get<T>(key: string, fallback: T): T {
      return (saved.get(key) as T) ?? fallback;
    },
    async update(key, value) {
      saved.set(key, value);
    },
  });
  const panels: string[][] = [[], []];
  const stops = panels.map((events) =>
    store.subscribe((scope, types) => events.push(scope + ":" + types.status)),
  );
  await store.set("one", "status", "text");
  stops[0]!();
  await store.set("one", "status", "checkbox");
  assert.deepEqual(panels, [["one:text"], ["one:text", "one:checkbox"]]);
  stops[1]!();
});
