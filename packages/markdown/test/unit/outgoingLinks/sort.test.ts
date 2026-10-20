import test from "node:test";
import assert from "node:assert/strict";
import {
  NEXT_SORT,
  compareOutgoingPaths,
  parseSortOrder,
  sortOutgoingPaths,
} from "../../../src/plugins/outgoingLinks/tree";

test("outgoing paths sort alphabetically by basename then path", () => {
  assert.deepEqual(
    sortOutgoingPaths([
      "zoo/Zebra.md",
      "Alpha.md",
      "notes/beta.md",
      "notes/Alpha.md",
    ]),
    ["Alpha.md", "notes/Alpha.md", "notes/beta.md", "zoo/Zebra.md"],
  );
});

test("unresolved linkpaths compare like file basenames", () => {
  assert.ok(compareOutgoingPaths("Alpha", "beta") < 0);
  assert.ok(compareOutgoingPaths("notes/Zed", "Alpha") > 0);
});

test("alphabeticalReverse is Z to A by basename then path", () => {
  assert.deepEqual(
    sortOutgoingPaths(
      ["zoo/Zebra.md", "Alpha.md", "notes/beta.md", "notes/Alpha.md"],
      "alphabeticalReverse",
    ),
    ["zoo/Zebra.md", "notes/beta.md", "notes/Alpha.md", "Alpha.md"],
  );
});

test("byModifiedTime is newer mtime first, then alphabetical", () => {
  const mtime = (path: string) =>
    ({ "a.md": 10, "b.md": 30, "c.md": 30, "d.md": 5 })[path] ?? 0;
  assert.deepEqual(
    sortOutgoingPaths(
      ["a.md", "b.md", "c.md", "d.md"],
      "byModifiedTime",
      mtime,
    ),
    ["b.md", "c.md", "a.md", "d.md"],
  );
});

test("byModifiedTimeReverse is older mtime first, then alphabetical", () => {
  const mtime = (path: string) =>
    ({ "a.md": 10, "b.md": 30, "c.md": 30, "d.md": 5 })[path] ?? 0;
  assert.deepEqual(
    sortOutgoingPaths(
      ["a.md", "b.md", "c.md", "d.md"],
      "byModifiedTimeReverse",
      mtime,
    ),
    ["d.md", "a.md", "b.md", "c.md"],
  );
});

test("title toggle cycles through Obsidian sort orders", () => {
  let order = parseSortOrder("alphabetical");
  const seen = [order];
  for (let i = 0; i < 4; i++) {
    order = NEXT_SORT[order];
    seen.push(order);
  }
  assert.deepEqual(seen, [
    "alphabetical",
    "alphabeticalReverse",
    "byModifiedTime",
    "byModifiedTimeReverse",
    "alphabetical",
  ]);
});

test("unknown sortOrder falls back to alphabetical", () => {
  assert.equal(parseSortOrder("byCreatedTime"), "alphabetical");
});
