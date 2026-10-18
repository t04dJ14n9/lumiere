import test from "node:test";
import assert from "node:assert/strict";
import { metadata } from "../../../src/markdown/metadata";
import { markdownParser } from "../../../src/markdown/dialect";

// What Obsidian's metadata cache holds for the same notes, measured in a
// throwaway vault (2026-10-17).

test("links, embeds and tags inside a %% comment are indexed, as Obsidian indexes them", () => {
  const note = metadata(
    "%% [md](x.md) ![[emb.png]] #tagincomment [[wl]] %%\n\n%%\nmulti [[multi link]]\n#multitag\n%%\n",
  );
  assert.deepEqual(
    note.links.map((link) => link.original),
    ["[md](x.md)", "[[wl]]", "[[multi link]]"],
  );
  assert.deepEqual(
    note.embeds.map((link) => link.original),
    ["![[emb.png]]"],
  );
  assert.deepEqual(
    note.tags.map((tag) => tag.tag),
    ["tagincomment", "multitag"],
  );
  const text = "%% see [[wl]] %%";
  const [link] = metadata(text).links;
  assert.equal(
    text.slice(link!.position.start.offset, link!.position.end.offset),
    "[[wl]]",
  );
});

test("headings inside a list item, quote or callout are not the note's headings", () => {
  const note = metadata(
    "- # List H1\n\n> [!note]\n> ## Callout H2\n\n> # Quote H1\n\n  # Indented H1\n\n    # Code\n",
  );
  assert.deepEqual(
    note.headings.map((heading) => `${heading.level} ${heading.heading}`),
    ["1 Indented H1"],
  );
});

test("a $$ line right after a paragraph line starts display math, and a link inside is not a link", () => {
  const text = "para line\n$$\n[[in math]]\n$$\nafter";
  const names: string[] = [];
  markdownParser.parse(text).iterate({
    enter(node) {
      names.push(node.name);
    },
  });
  assert.ok(names.includes("MathBlock"));
  assert.deepEqual(metadata(text).links, []);
});

// Measured in Obsidian 1.14.4: `|` splits a wikilink only after a name.
test("a wikilink starting with | is a link to a note of that name", () => {
  const links = metadata("a [[|Only Alias]] b [[Note|]] c [[|]]").links.map(
    (link) => [link.link, link.displayText],
  );
  assert.deepEqual(links, [
    ["|Only Alias", "|Only Alias"],
    ["Note", "Note"],
    ["|", "|"],
  ]);
});
