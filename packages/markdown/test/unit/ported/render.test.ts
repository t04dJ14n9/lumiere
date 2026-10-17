import { test } from "node:test";
import assert from "node:assert/strict";

import { createRenderer } from "../../../src/markdown/html";
const { renderMarkdown } = createRenderer();
import { frontmatter } from "../../../src/markdown/properties";
import { wikiTarget } from "../../../src/markdown/html";
import { markdownParser } from "../../../src/markdown/dialect";
import { noteFragment } from "../../../src/markdown/metadata/fragments";

test("hybrid syntax keeps code opaque while parsing highlights, comments and formulas", () => {
  const syntax = markdownParser;
  const tree = syntax
    .parse(
      "==highlight== and $x^2$ and %%comment%%\n\n```\n==not highlighted==\n```",
    )
    .toString();
  assert.match(tree, /Highlight\(HighlightMark,HighlightMark\)/);
  assert.match(tree, /InlineMath/);
  assert.match(tree, /ObsidianComment/);
  assert.equal(tree.match(/Highlight\(/g)?.length, 1);
});
test("properties parse scalar and list types without accepting duplicate keys", () => {
  assert.deepEqual(
    frontmatter("---\ntags: [a, b]\nchecked: true\ncount: 2\n---\n")?.values,
    {
      tags: ["a", "b"],
      checked: true,
      count: 2,
    },
  );
  assert.ok(frontmatter("---\nname: a\nname: b\n---\n")?.error);
});
test("nested and folded callouts preserve inline formatting and independent containers", () => {
  const html = renderMarkdown(
    "> [!warning]- **Careful**\n> Text\n>\n> > [!tip] Nested\n> > More\n",
  );
  assert.match(html, /<details class="callout" data-callout="warning">/);
  assert.match(html, /<strong>Careful<\/strong>/);
  assert.match(html, /<aside class="callout" data-callout="tip">/);
  assert.ok(html.indexOf("</aside>") < html.indexOf("</details>"));
});
test("diagram and formula payloads are encoded before becoming HTML attributes", () => {
  assert.match(
    renderMarkdown("```mermaid\nA --> B\n```"),
    /data-fence="mermaid" data-source="A%20--%3E%20B%0A"/,
  );
  assert.match(renderMarkdown("$a > b$"), /data-math="a%20%3E%20b"/);
});
test("aliases and image dimensions handle escaped table pipes", () => {
  assert.deepEqual(wikiTarget("note\\|caption"), {
    target: "note",
    label: "caption",
  });
  assert.deepEqual(wikiTarget("image.svg|120x60"), {
    target: "image.svg",
    label: "120x60",
    width: 120,
    height: 60,
  });
  const html = renderMarkdown(
    "| A | B |\n| -- | -- |\n| [[note\\|caption]] | ![[image.svg\\|120]] |",
  );
  assert.match(html, />caption<\/a>/);
  assert.match(html, /data-width="120"/);
});
test("heading fragments include descendants and stop before a sibling, ignoring fenced headings", () => {
  const source =
    "# Root\n\n## Selected\n\nFirst\n\n```\n## Fake\n```\n\n### Child\n\nNested\n\n## Other\n\nExcluded\n";
  const result = noteFragment(source, "Root#Selected");
  assert.ok(result?.text.includes("### Child"));
  assert.ok(!result?.text.includes("Excluded"));
  assert.equal(noteFragment(source, "Fake"), undefined);
});
test("block fragments support a paragraph and a separately identified list", () => {
  const source =
    "# Note\n\nThis paragraph. ^paragraph\n\n- One\n- Two\n\n^list\n";
  assert.equal(noteFragment(source, "^paragraph")?.text, "This paragraph.");
  assert.equal(noteFragment(source, "^list")?.text, "- One\n- Two");
});

test("rendered note embeds hide block identifiers while fenced code remains literal", () => {
  const html = renderMarkdown(
    "A paragraph. ^paragraph\n\n- One\n- Two\n\n^list\n\n```\n^literal\n```",
  );
  assert.ok(!html.includes("^paragraph"));
  assert.ok(!html.includes("^list"));
  assert.ok(html.includes("^literal"));
});

test("named footnotes and collapsed reference links retain their separate syntax", () => {
  const html = renderMarkdown(
    "[guide][] and evidence[^paper].\n\n[guide]: concepts/guide.md\n[^paper]: Source text.",
  );
  assert.match(html, /href="concepts\/guide.md"/);
  assert.match(html, /class="footnote-ref"/);
  assert.match(html, /Source text/);
});
