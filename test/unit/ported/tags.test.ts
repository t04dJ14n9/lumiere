import test from "node:test";
import assert from "node:assert/strict";
import { noteTags } from "../../../src/markdown/metadata/tags";
import { tagMatches, validTag } from "../../../src/markdown/tags/grammar";
import { createRenderer } from "../../../src/markdown/html";
const { renderMarkdown } = createRenderer();

test("tags combine Markdown and YAML while excluding code, escapes, comments and numeric tags", () => {
  const source =
    '---\ntags: [Project/Notes, "#学习", 123]\nother: "#excluded"\n---\n# Heading\n\n#project #🙂 #1984 #y1984 C#code \\#escaped `#code` %%#comment%%\n\n```md\n#fenced\n```';
  assert.deepEqual(
    noteTags(source).sort(),
    ["Project/Notes", "project", "y1984", "学习", "🙂"].sort(),
  );
  assert.equal(tagMatches("Project/Notes", "PROJECT"), true);
  assert.equal(tagMatches("projectile", "project"), false);
  assert.equal(validTag("1984"), false);
  assert.equal(validTag("two words"), false);
  assert.equal(validTag("Project/Notes"), true);
  assert.equal(validTag("bad\nquery"), false);
});

test("rendered tag controls preserve hierarchy and leave code literal", () => {
  const html = renderMarkdown(
    "> [!note] Tags\n> #project/notes and `#code`\n\n| Tag |\n| --- |\n| #学习 |",
  );
  assert.match(html, /data-tag="project\/notes"/);
  assert.match(html, /data-tag="学习"/);
  assert.doesNotMatch(html, /data-tag="code"/);
});

test("tags in footnote definitions remain searchable", () => {
  assert.deepEqual(
    noteTags("Body[^a].\n\n[^a]: #Footnote\n  with `#excluded`"),
    ["Footnote"],
  );
});
