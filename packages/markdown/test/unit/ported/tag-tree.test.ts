import test from "node:test";
import assert from "node:assert/strict";
import { tagTree } from "../../../src/markdown/tags/tree";

const notes = [
  { id: "a", tags: ["Project/One", "project/Two", "Project"] },
  { id: "b", tags: ["PROJECT/one"] },
  { id: "c", tags: ["Other"] },
];
test("tag hierarchy merges case variants and counts each note once in parent totals", () => {
  const roots = tagTree(notes, true, false);
  assert.deepEqual(
    roots.map((node) => [node.tag, node.count]),
    [
      ["Other", 1],
      ["Project", 2],
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
      ["Project", 2],
      ["Project/One", 2],
      ["Other", 1],
      ["project/Two", 1],
    ],
  );
  assert.ok(flat.every((node) => node.children.length === 0));
  assert.equal(tagTree(notes, true, true)[0]!.key, "project");
});
