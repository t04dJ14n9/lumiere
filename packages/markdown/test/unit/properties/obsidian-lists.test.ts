import test from "node:test";
import assert from "node:assert/strict";
import {
  propertyChanges,
  type PropertyEdit,
} from "../../../src/markdown/properties";

// Expected notes are Obsidian's, measured by editing the same properties in a
// throwaway vault (2026-10-17).

function edit(source: string, operation: PropertyEdit): string {
  const changes = propertyChanges(source, operation);
  assert.ok(changes, `Rejected ${operation.type} on ${JSON.stringify(source)}`);
  for (const change of [...changes].sort((a, b) => b.from - a.from)) {
    source =
      source.slice(0, change.from) + change.insert + source.slice(change.to);
  }
  return source;
}

const set = (source: string, key: string, value: string[]) =>
  edit(source, { type: "set", key, value });

test("a list is written as a block list, two spaces in, whatever its shape before", () => {
  assert.equal(
    set("---\naliases:\n---\nbody", "aliases", ["new"]),
    "---\naliases:\n  - new\n---\nbody",
  );
  assert.equal(
    set("---\naliases:\n  - One\n---\nbody", "aliases", ["One", "new"]),
    "---\naliases:\n  - One\n  - new\n---\nbody",
  );
  for (const before of ["tags: [a]", "tags: a", "tags:\n- a"]) {
    assert.equal(
      set(`---\n${before}\n---\nbody`, "tags", ["a", "new"]),
      "---\ntags:\n  - a\n  - new\n---\nbody",
    );
  }
});

test("an empty list is a bare key", () => {
  assert.equal(
    set("---\ntags:\n  - only\n---\nbody", "tags", []),
    "---\ntags:\n---\nbody",
  );
  assert.equal(
    set("---\ntags: [only]\n---\nbody", "tags", []),
    "---\ntags:\n---\nbody",
  );
});

test("list items are quoted only where YAML needs it", () => {
  const added = (item: string) =>
    set("---\ncustom:\n  - x\n---\nbody", "custom", ["x", item]).split("\n")[3];
  assert.equal(added("has: colon"), '  - "has: colon"');
  assert.equal(added("#hash"), '  - "#hash"');
  assert.equal(added("quote's"), "  - quote's");
  assert.equal(added("123"), '  - "123"');
  assert.equal(added("true"), '  - "true"');
  assert.equal(added("a, b"), "  - a, b");
  assert.equal(added("[x]"), '  - "[x]"');
});

test("new properties and a new header are written the same way", () => {
  assert.equal(
    edit("body", { type: "add", key: "aliases" }),
    "---\naliases:\n---\nbody",
  );
  assert.equal(
    edit("---\ntitle: x\n---\nbody", {
      type: "add",
      key: "tags",
      value: ["a", "b"],
    }),
    "---\ntitle: x\ntags:\n  - a\n  - b\n---\nbody",
  );
});
