import test from "node:test";
import assert from "node:assert/strict";
import { Text } from "@codemirror/state";
import { metadata } from "../../../src/markdown/metadata";
import { createRenderer } from "../../../src/markdown/html";
test("one metadata result contains positions, aliases, links, embeds, blocks and tasks", () => {
  const source =
    '---\naliases: [Alias]\ntags: [project]\nrelated: "[[Other#Heading|Label]]"\n# [[not-a-value]]\n---\n# Title\n\n[[Note|Shown]] ![[Image.png]] [web](https://example.test)\n\n- [x] Done #nested/tag\n\nParagraph. ^id\n\n`[[excluded]]`\n';
  const doc = Text.of(source.split("\n")),
    note = metadata(doc);
  assert.equal(metadata(doc), note);
  assert.deepEqual(note.aliases, ["Alias"]);
  assert.deepEqual(
    note.links.map((link) => link.link),
    ["Note", "https://example.test"],
  );
  assert.deepEqual(
    note.embeds.map((link) => link.link),
    ["Image.png"],
  );
  assert.equal(note.headings[0]?.heading, "Title");
  assert.equal(note.listItems[0]?.task, "x");
  assert.equal(note.blocks.id?.text, "Paragraph.");
  assert.deepEqual(
    note.frontmatterLinks.map((link) => [link.key, link.link]),
    [["related", "Other#Heading"]],
  );
  for (const link of [...note.links, ...note.embeds, ...note.frontmatterLinks])
    assert.equal(source.slice(link.position.start.offset, link.position.end.offset), link.original);
  assert.deepEqual(note.tags.map((tag) => tag.tag).sort(), ["nested/tag", "project"]);
});
test("reference links resolve through definitions and syntax inside code remains opaque", () => {
  const note = metadata(
    "[go][label] [label][] [label]\n\n[label]: target.md\n\n```md\n[[not]] ^fake\n```",
  );
  assert.deepEqual(
    note.links.map((link) => link.link),
    ["target.md", "target.md", "target.md"],
  );
  assert.equal(note.blocks.fake, undefined);
});
test("renderer instances isolate line-break configuration and emit generic fence placeholders", () => {
  const loose = createRenderer(),
    strict = createRenderer({ strictLineBreaks: true });
  assert.match(loose.renderMarkdown("a\nb"), /<br>/);
  assert.doesNotMatch(strict.renderMarkdown("a\nb"), /<br>/);
  assert.match(loose.renderMarkdown('```query\n"<unsafe>"\n```'), /data-fence="query"/);
  assert.doesNotMatch(loose.renderMarkdown("---\na: 1\n---\nBody"), /properties|<input/);
});
