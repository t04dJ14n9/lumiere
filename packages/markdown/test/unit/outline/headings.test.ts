import test from "node:test";
import assert from "node:assert/strict";
import { metadata } from "../../../src/markdown/metadata";
import { headingAt, outlineOf } from "../../../src/plugins/outline/headings";

const text = [
  "# One",
  "intro",
  "### Deep",
  "## Two",
  "text",
  "# Three",
  "## Four",
].join("\n");

test("headings nest by level, and skipped levels nest under the nearest heading", () => {
  const outline = outlineOf(metadata(text).headings);
  const shape = (nodes: typeof outline): unknown =>
    nodes.map((node) => [node.id, node.title, shape(node.children)]);
  assert.deepEqual(shape(outline), [
    [
      "0",
      "One",
      [
        ["0/0", "Deep", []],
        ["0/1", "Two", []],
      ],
    ],
    ["1", "Three", [["1/0", "Four", []]]],
  ]);
  assert.equal(outline[0]!.children[1]!.parent, outline[0]);
});

test("the caret's section is the last heading at or before it", () => {
  const outline = outlineOf(metadata(text).headings);
  assert.equal(headingAt(outline, 0)?.title, "One");
  assert.equal(headingAt(outline, text.indexOf("intro"))?.title, "One");
  assert.equal(headingAt(outline, text.indexOf("text"))?.title, "Two");
  assert.equal(headingAt(outline, text.length)?.title, "Four");
  assert.equal(
    headingAt(outlineOf(metadata("no headings").headings), 3),
    undefined,
  );
});
