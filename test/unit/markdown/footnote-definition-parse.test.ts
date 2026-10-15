import test from "node:test";
import assert from "node:assert/strict";
import { markdownParser } from "../../../src/markdown/dialect";

function nodes(source: string): { name: string; text: string }[] {
  const found: { name: string; text: string }[] = [];
  markdownParser.parse(source).iterate({
    enter(node) {
      if (
        [
          "FootnoteRef",
          "Link",
          "WikiLink",
          "LinkReference",
          "Autolink",
          "URL",
          "Paragraph",
        ].includes(node.name)
      ) {
        found.push({
          name: node.name,
          text: source.slice(node.from, node.to),
        });
      }
    },
  });
  return found;
}

test("a footnote definition whose body is a markdown link is a paragraph, not a LinkReference", () => {
  const source = [
    "See[^overview]",
    "",
    "[^overview]: [伽利略概述](https://example.com/overview)",
  ].join("\n");
  const tree = nodes(source);
  assert.equal(
    tree.some((node) => node.name === "LinkReference"),
    false,
  );
  assert.deepEqual(
    tree.filter((node) => node.name === "FootnoteRef").map((node) => node.text),
    ["[^overview]", "[^overview]"],
  );
  assert.ok(
    tree.some(
      (node) => node.name === "Link" && node.text.includes("伽利略概述"),
    ),
  );
});

test("a footnote definition whose body is a wiki link keeps WikiLink syntax", () => {
  const source = "See[^w]\n\n[^w]: [[Target Note]]";
  const tree = nodes(source);
  assert.equal(
    tree.some((node) => node.name === "LinkReference"),
    false,
  );
  assert.ok(
    tree.some(
      (node) => node.name === "WikiLink" && node.text === "[[Target Note]]",
    ),
  );
  assert.ok(
    tree.some(
      (node) =>
        node.name === "FootnoteRef" && node.text === "[^w]" && node !== tree[0],
    ) || tree.filter((node) => node.name === "FootnoteRef").length === 2,
  );
});

test("bare-URL and autolink footnote bodies are not LinkReference blocks", () => {
  for (const body of ["https://example.com", "<https://example.com>"]) {
    const source = `See[^1]\n\n[^1]: ${body}`;
    assert.equal(
      nodes(source).some((node) => node.name === "LinkReference"),
      false,
      body,
    );
    assert.ok(
      nodes(source).some(
        (node) => node.name === "FootnoteRef" && node.text === "[^1]",
      ),
      body,
    );
  }
});

test("indented continuations stay in the definition paragraph", () => {
  const source = [
    "See[^note]",
    "",
    "[^note]: A named footnote that",
    "    continues on an indented line.",
  ].join("\n");
  const paragraphs = nodes(source).filter((node) => node.name === "Paragraph");
  assert.ok(
    paragraphs.some((node) =>
      node.text.includes("continues on an indented line."),
    ),
  );
});

test("consecutive link-body definitions each keep FootnoteRef and Link", () => {
  const source = [
    "See[^a][^b]",
    "",
    "[^a]: [Alpha](https://a.example)",
    "[^b]: [Beta](https://b.example)",
  ].join("\n");
  const tree = nodes(source);
  assert.equal(tree.filter((node) => node.name === "LinkReference").length, 0);
  assert.deepEqual(
    tree.filter((node) => node.name === "FootnoteRef").map((node) => node.text),
    ["[^a]", "[^b]", "[^a]", "[^b]"],
  );
  assert.equal(tree.filter((node) => node.name === "Link").length, 2);
});

test("continuation lines keep inline child offsets aligned with the source", () => {
  const source = ["[^a]: first", "    [link](https://example.com)"].join("\n");
  const ranges: { name: string; from: number; to: number; text: string }[] = [];
  markdownParser.parse(source).iterate({
    enter(node) {
      if (
        node.name === "Link" ||
        node.name === "URL" ||
        node.name === "FootnoteRef"
      ) {
        ranges.push({
          name: node.name,
          from: node.from,
          to: node.to,
          text: source.slice(node.from, node.to),
        });
      }
    },
  });
  assert.deepEqual(ranges, [
    { name: "FootnoteRef", from: 0, to: 4, text: "[^a]" },
    {
      name: "Link",
      from: source.indexOf("[link]"),
      to: source.length,
      text: "[link](https://example.com)",
    },
    {
      name: "URL",
      from: source.indexOf("https://"),
      to: source.indexOf("https://") + "https://example.com".length,
      text: "https://example.com",
    },
  ]);
});
