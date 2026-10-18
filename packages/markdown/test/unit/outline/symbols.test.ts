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

test("document symbols nest like Markdown Outline and keep heading labels", () => {
  const headings = metadata(text).headings;
  const symbols = outlineSymbols(headings);
  const outline = outlineOf(headings);
  const symbolShape = (nodes: typeof symbols): [string, string, unknown][] =>
    nodes.map((node) => [
      node.name,
      `h${node.level}`,
      symbolShape(node.children),
    ]);
  const outlineShape = (nodes: typeof outline): [string, string, unknown][] =>
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

test("a heading inside a quote is not in the outline, as in Obsidian", () => {
  // Obsidian counts only a note's own headings: none inside a list item,
  // quote or callout (measured with its metadata and outline).
  const text = "> # Quoted\n> body\n\n## Outside\n### Deep\nbody\n# Next\n";
  const symbols = outlineSymbols(metadata(text).headings);
  const outside = symbols[0]!;
  const deep = outside.children[0]!;
  assert.equal(outside.name, "Outside");
  assert.equal(deep.name, "Deep");
  assert.equal(symbols[1]!.name, "Next");
  assert.ok(outside.end >= deep.end);
  assert.ok(outside.end <= symbols[1]!.start);
});

test("every ancestor contains descendant sections and selections with quoted and setext headings", () => {
  for (const eol of ["\n", "\r\n"]) {
    const text = [
      "> # Quoted",
      "> > ## Nested quote",
      "> > body",
      "",
      "### Outside",
      "body",
      "Setext",
      "------",
      "#### Skipped level",
      "body",
      "# Next",
    ].join(eol);
    const verifyRanges = (nodes: ReturnType<typeof outlineSymbols>) => {
      for (const node of nodes) {
        assert.ok(node.start <= node.selectionStart, node.name);
        assert.ok(node.end >= node.selectionEnd, node.name);
        for (const child of node.children) {
          assert.ok(node.start <= child.start, `${node.name} / ${child.name}`);
          assert.ok(node.end >= child.end, `${node.name} / ${child.name}`);
        }
        verifyRanges(node.children);
      }
    };
    const symbols = outlineSymbols(metadata(text).headings);
    assert.equal(symbols[0]!.name, "Outside");
    verifyRanges(symbols);
  }
});
