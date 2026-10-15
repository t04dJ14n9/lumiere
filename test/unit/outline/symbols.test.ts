import test from "node:test";
import assert from "node:assert/strict";
import { metadata } from "../../../src/markdown/metadata";
import { outlineOf } from "../../../src/plugins/outline/headings";
import { outlineSymbols } from "../../../src/plugins/outline/symbols";

const text = [
  "# One",
  "intro",
  "### Deep",
  "## Two",
  "text",
  "# Three",
  "## Four",
].join("\n");

test("document symbols nest like Note Outline and keep heading labels", () => {
  const headings = metadata(text).headings;
  const symbols = outlineSymbols(headings);
  const outline = outlineOf(headings);
  const symbolShape = (
    nodes: typeof symbols,
  ): [string, string, unknown][] =>
    nodes.map((node) => [node.name, `h${node.level}`, symbolShape(node.children)]);
  const outlineShape = (
    nodes: typeof outline,
  ): [string, string, unknown][] =>
    nodes.map((node) => [
      node.title,
      `h${node.level}`,
      outlineShape(node.children),
    ]);
  assert.deepEqual(symbolShape(symbols), outlineShape(outline));
  assert.deepEqual(
    symbols.map((node) => node.name),
    ["One", "Three"],
  );
  assert.deepEqual(
    symbols[0]!.children.map((node) => node.name),
    ["Deep", "Two"],
  );
});

test("each symbol's selection is the heading line and its range covers the section", () => {
  const symbols = outlineSymbols(metadata(text).headings);
  const one = symbols[0]!;
  assert.equal(text.slice(one.selectionStart, one.selectionEnd), "# One");
  assert.ok(one.start === one.selectionStart);
  assert.ok(one.end > one.selectionEnd);
  assert.ok(text.slice(one.start, one.end).includes("### Deep"));
  assert.ok(text.slice(one.start, one.end).includes("## Two"));
  assert.ok(!text.slice(one.start, one.end).includes("# Three"));
  const deep = one.children[0]!;
  assert.equal(text.slice(deep.selectionStart, deep.selectionEnd), "### Deep");
  assert.ok(deep.end <= one.children[1]!.start);
});

test("empty heading titles become a visible placeholder label", () => {
  const symbols = outlineSymbols(metadata("# \n").headings);
  assert.equal(symbols[0]?.name, "(empty)");
});
