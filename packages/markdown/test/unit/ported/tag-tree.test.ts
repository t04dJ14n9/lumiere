import test from "node:test";
import assert from "node:assert/strict";
import { tagTree } from "../../../src/markdown/tags/tree";

const notes = [
  { id: "a", tags: ["Project/One", "project/Two", "Project"] },
  { id: "b", tags: ["PROJECT/one"] },
  { id: "c", tags: ["Other"] },
];
// Counted as Obsidian's Tags pane counts (measured): every use, a parent
// counting each use of its descendants, under the most used spelling.
test("tag hierarchy merges case variants and counts every use in parent totals", () => {
  const roots = tagTree(notes, true, false);
  assert.deepEqual(
    roots.map((node) => [node.tag, node.count]),
    [
      ["Other", 1],
      ["Project", 4],
    ],
  );
  assert.deepEqual(
    roots[1]!.children.map((node) => [node.key, node.count]),
    [
      ["project/one", 2],
      ["project/two", 1],
    ],
  );
});
test("flat tags retain full paths while frequency sorting orders each level", () => {
  const flat = tagTree(notes, false, true);
  assert.deepEqual(
    flat.map((node) => [node.label, node.count]),
    [
      ["Project", 4],
      ["Project/One", 2],
      ["Other", 1],
      ["project/Two", 1],
    ],
  );
  assert.ok(flat.every((node) => node.children.length === 0));
  assert.equal(tagTree(notes, true, true)[0]!.key, "project");
});
test("the flat list has a parent path written only inside a nested tag", () => {
  const flat = tagTree([{ id: "a", tags: ["nested/tag"] }], false, false);
  assert.deepEqual(
    flat.map((node) => [node.label, node.count]),
    [
      ["nested", 1],
      ["nested/tag", 1],
    ],
  );
});
test("case variants show under the most used spelling", () => {
  const roots = tagTree(
    [{ id: "a", tags: ["Project/one", "project/two", "project"] }],
    true,
    false,
  );
  assert.equal(roots[0]!.tag, "project");
});
