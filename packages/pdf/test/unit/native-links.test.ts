import assert from "node:assert/strict";
import { test } from "node:test";
import { nativeLinks, localFragment } from "../../src/shared/native-links";

test("precise links retain source ranges, encoded filenames, Unicode, spaces and rectangles", () => {
  const source =
    "[note](<目录/我的 note.md#middle-target>) [pdf](docs/a%20b.pdf#page=9&viewrect=72,130,100,30)";
  const links = nativeLinks(source);
  assert.equal(links.length, 2);
  for (const link of links) {
    assert.equal(source.slice(link.from, link.to), link.href);
  }
  assert.deepEqual(localFragment(links[0]!.href), {
    path: "目录/我的 note.md",
    fragment: "middle-target",
  });
  assert.deepEqual(localFragment(links[1]!.href), {
    path: "docs/a b.pdf",
    fragment: "page=9&viewrect=72,130,100,30",
  });
  assert.deepEqual(localFragment("a%23b.md#100%25"), {
    path: "a#b.md",
    fragment: "100%25",
  });
});

test("code, images, escaped labels, malformed destinations and unsupported entities stay native", () => {
  const source = [
    "`[x](a.md#h)`",
    "![x](a.md#h)",
    String.raw`\[x](a.md#h)`,
    "```md",
    "[x](a.md#h)",
    "```",
    "    [x](a.md#h)",
    "[x](<unclosed.md#h)",
    "[x](a&amp;b.md#h)",
  ].join("\n");
  assert.deepEqual(nativeLinks(source), []);
});

test("balanced parentheses, escaped punctuation and titles do not enlarge href ranges", () => {
  const source = '[x](a(b).md#h "title") [y](<a b.pdf#page=2>)';
  assert.deepEqual(
    nativeLinks(source).map((x) => x.href),
    ["a(b).md#h", "a b.pdf#page=2"],
  );
  assert.equal(nativeLinks(String.raw`[x](a\(b\).md#h)`)[0]?.href, "a(b).md#h");
});

test("external, command, UNC, malformed encoding and control paths are never intercepted", () => {
  for (const href of [
    "https://example.com/a.md#h",
    "command:foo#h",
    "file:///a.md#h",
    "//server/a.md#h",
    "a%ZZ.md#h",
    "a.md#%ZZ",
    "a%00.md#h",
    "C:%5Ca.md#h",
    "a.md",
    "a.md#",
  ]) {
    assert.equal(localFragment(href), undefined, href);
  }
});

test("opaque multiline Markdown contexts never create executable precise links", () => {
  const hidden = [
    "`multiline\n[hidden](target.md#one)\ncode`",
    "<!-- comment\n[hidden](target.md#one)\n-->",
    "> ```md\n> [hidden](target.md#one)\n> ```",
    "- ```md\n  [hidden](target.md#one)\n  ```",
    "<script>\n[hidden](target.md#one)\n</script>",
    "<div>\n[hidden](target.md#one)\n</div>",
    "`` multiple ` lengths\n[hidden](target.md#one)\n``",
  ];
  for (const context of hidden) {
    const text = context + "\n\n[visible](target.md#two)";
    assert.deepEqual(
      nativeLinks(text).map((link) => link.href),
      ["target.md#two"],
      context,
    );
    const [link] = nativeLinks(text);
    assert.equal(text.slice(link!.from, link!.to), "target.md#two");
  }
  assert.equal(
    nativeLinks("Unmatched ` tick [visible](target.md#one)").length,
    1,
  );
});
