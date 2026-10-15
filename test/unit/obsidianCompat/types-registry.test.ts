import assert from "node:assert/strict";
import test from "node:test";
import {
  TypesRegistry,
  TypesRegistryConflict,
} from "../../../src/plugins/obsidianCompat/types-registry";
import {
  editablePropertyKind,
  parseTypesDocument,
  wirePropertyType,
} from "../../../src/plugins/obsidianCompat/types-document";

function registryFixture(source: string | undefined) {
  const state = {
    source,
    failure: undefined as Error | undefined,
    beforeWrite: undefined as (() => void) | undefined,
    writes: [] as string[],
    warnings: [] as string[],
    changed: 0,
  };
  const registry = new TypesRegistry({
    async read() {
      if (state.failure) {
        throw state.failure;
      }
      return state.source;
    },
    async write(text, expected) {
      state.beforeWrite?.();
      if (state.source !== expected) {
        throw new TypesRegistryConflict();
      }
      state.source = text;
      state.writes.push(text);
    },
    warn: (message) => state.warnings.push(message),
    changed: () => {
      state.changed += 1;
    },
  });
  return { registry, state };
}

test("B1: wire types retain aliases, multitext and tags; UI conversion is separate", () => {
  const values = {
    title: "text",
    count: "number",
    done: "checkbox",
    due: "date",
    updated: "datetime",
    authors: "multitext",
    tags: "tags",
    aliases: "aliases",
    cssclasses: "multitext",
    future: "future-type",
  };
  const parsed = parseTypesDocument(JSON.stringify({ types: values }));
  assert.deepEqual(parsed.types, values);
  assert.equal(editablePropertyKind("multitext"), "list");
  assert.equal(wirePropertyType("list"), "multitext");
  assert.equal(editablePropertyKind("aliases"), "aliases");
  assert.equal(wirePropertyType("aliases"), "aliases");
  assert.equal(editablePropertyKind("tags"), "tags");
  assert.equal(editablePropertyKind("future-type"), undefined);
  assert.ok(Object.isFrozen(parsed.types));
});

test("B1: RMW preserves unknown property names, type strings, entries and top-level keys", async () => {
  const document = JSON.parse(
    '{"future":{"version":2},"types":{"aliases":"aliases","cssclasses":"multitext","tags":"tags","future/type":"next-kind","opaque":{"data":[1]},"__proto__":"future-prototype","status":"text"}}',
  );
  const { registry, state } = registryFixture(JSON.stringify(document));
  await registry.refresh();
  await registry.set("status", "number");
  document.types.status = "number";
  assert.deepEqual(JSON.parse(state.source!), document);
  await registry.set("status", null);
  delete document.types.status;
  assert.deepEqual(JSON.parse(state.source!), document);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  await registry.dispose();
});

for (const source of [
  "{",
  "null",
  "[]",
  '{"types":[]}',
  '{"types":null}',
  '{"types":"text"}',
]) {
  test(`B1: invalid types document ${source} cannot be overwritten`, async () => {
    const { registry, state } = registryFixture(source);
    await registry.refresh();
    assert.deepEqual(registry.types, {});
    await assert.rejects(registry.set("status", "text"), /unreadable/);
    await registry.refresh();
    assert.equal(state.source, source);
    assert.equal(state.writes.length, 0);
    assert.equal(state.warnings.length, 1);
    await registry.dispose();
  });
}

test("B1: permission and transient read failures retain last-good data and never write", async () => {
  const initial = '{"types":{"status":"text"}}';
  const { registry, state } = registryFixture(initial);
  await registry.refresh();
  const lastGood = registry.types;
  state.failure = new Error("temporarily unavailable");
  await registry.refresh();
  await registry.refresh();
  await assert.rejects(registry.set("status", "number"), /unreadable/);
  assert.equal(registry.types, lastGood);
  assert.equal(state.source, initial);
  assert.equal(state.writes.length, 0);
  assert.equal(state.warnings.length, 1);
  state.failure = undefined;
  await registry.set("status", "checkbox");
  assert.equal(registry.types.status, "checkbox");
  await registry.dispose();
});

test("B1: an unreadable first read exposes empty memory only", async () => {
  const { registry, state } = registryFixture("unreadable content");
  state.failure = new Error("permission denied");
  await registry.refresh();
  await assert.rejects(registry.set("x", "text"), /unreadable/);
  assert.deepEqual(registry.types, {});
  assert.equal(state.writes.length, 0);
  assert.equal(state.source, "unreadable content");
  await registry.dispose();
});

test("B1: missing types is inference only; an explicit edit may create it", async () => {
  const { registry, state } = registryFixture(undefined);
  await registry.refresh();
  assert.deepEqual(registry.types, {});
  assert.equal(state.writes.length, 0);
  assert.equal(state.warnings.length, 0);
  await registry.set("due", "date");
  assert.deepEqual(JSON.parse(state.source!), { types: { due: "date" } });
  await registry.dispose();
});

test("B1: external edits and deletion conflict with the cached edit base", async () => {
  const { registry, state } = registryFixture('{"types":{"status":"text"}}');
  await registry.refresh();
  state.source = '{"types":{"status":"checkbox","other":"future"}}';
  await assert.rejects(registry.set("status", "number"), TypesRegistryConflict);
  assert.equal(state.writes.length, 0);
  assert.equal(registry.types.status, "checkbox");
  assert.equal(registry.types.other, "future");
  await registry.set("status", "number");
  assert.equal(registry.types.other, "future");
  state.source = undefined;
  await assert.rejects(registry.set("x", "text"), TypesRegistryConflict);
  assert.equal(state.writes.length, 1);
  await registry.dispose();
});

test("B1: concurrent edits serialize, compose and leave the queue usable after rejection", async () => {
  const { registry, state } = registryFixture('{"types":{}}');
  await registry.refresh();
  await Promise.all([
    registry.set("a", "text"),
    registry.set("b", "number"),
    registry.set("c", "date"),
  ]);
  assert.deepEqual(JSON.parse(state.source!), {
    types: { a: "text", b: "number", c: "date" },
  });
  assert.equal(state.writes.length, 3);
  await registry.dispose();
  await assert.rejects(registry.set("d", "text"), /stopped/);
});

test("B1: a conditional writer rejects B arriving after the final registry read without accepting A-derived types", async () => {
  const base = '{"types":{"status":"text"}}';
  const external = '{"types":{"status":"checkbox","unknown":"future"}}';
  const { registry, state } = registryFixture(base);
  await registry.refresh();
  const lastGood = registry.types;
  const changes = state.changed;
  state.beforeWrite = () => {
    state.source = external;
  };
  await assert.rejects(registry.set("status", "number"), TypesRegistryConflict);
  assert.equal(state.source, external);
  assert.equal(state.writes.length, 0);
  assert.equal(registry.types, lastGood);
  assert.equal(state.changed, changes);
  state.beforeWrite = undefined;
  await registry.refresh();
  assert.deepEqual(registry.types, { status: "checkbox", unknown: "future" });
  await registry.set("status", "number");
  assert.deepEqual(JSON.parse(state.source!), {
    types: { status: "number", unknown: "future" },
  });
  await registry.dispose();
});

test("B1: built-ins reject incompatible retypes, including case variants", async () => {
  const { registry, state } = registryFixture('{"types":{}}');
  for (const name of ["tags", "Tags", "aliases", "ALIASES", "cssclasses"]) {
    assert.throws(() => registry.set(name, "number"), /built-in/);
  }
  await registry.set("tags", "tags");
  await registry.set("aliases", "aliases");
  await registry.set("cssclasses", "multitext");
  assert.deepEqual(JSON.parse(state.source!), {
    types: { tags: "tags", aliases: "aliases", cssclasses: "multitext" },
  });
  await registry.dispose();
});
