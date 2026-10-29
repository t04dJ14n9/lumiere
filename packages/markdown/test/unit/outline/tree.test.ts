import test from "node:test";
import assert from "node:assert/strict";
import { OutlineSource } from "../../../src/plugins/outline/tree";

test("active outline item follows section boundaries and nested siblings", () => {
  const text =
    "preamble\n# Parent\nintro\n### Deep\nbody\n## Sibling\nbody\n# Next\nend";
  const source = new OutlineSource();
  source.set("memory:///A.md", text);
  for (const [offset, title] of [
    [0, undefined],
    [text.indexOf("# Parent"), "Parent"],
    [text.indexOf("intro"), "Parent"],
    [text.indexOf("### Deep"), "Deep"],
    [text.indexOf("body"), "Deep"],
    [text.indexOf("## Sibling"), "Sibling"],
    [text.indexOf("# Next") - 1, "Sibling"],
    [text.indexOf("# Next"), "Next"],
    [text.length, "Next"],
    [text.length + 100, "Next"],
  ] as const) {
    assert.equal(source.activeNode(offset)?.label, title, String(offset));
  }
  assert.equal(
    source.parent(source.activeNode(text.indexOf("body"))!)?.label,
    "Parent",
  );
});

test("LF editor offsets find the right CRLF section and clicks keep source offsets", () => {
  const text = "preamble\r\n# First\r\nbody\r\n## Second\r\nbody\r\n# Last\r\n";
  const source = new OutlineSource();
  source.set("memory:///A.md", text);
  const editorText = text.replaceAll("\r\n", "\n");
  const node = source.activeNode(editorText.indexOf("## Second"))!;
  assert.equal(node.label, "Second");
  assert.deepEqual(node.command?.args, [
    "memory:///A.md",
    text.indexOf("## Second"),
  ]);
  assert.equal(source.activeNode(editorText.indexOf("# Last"))?.label, "Last");
});

test("repeated headings are distinct active items, and replacing a note clears its index", () => {
  const text = "# Same\nfirst\n# Same\nsecond";
  const source = new OutlineSource();
  source.set("memory:///A.md", text);
  assert.notEqual(
    source.activeNode(text.indexOf("first"))?.id,
    source.activeNode(text.indexOf("second"))?.id,
  );
  source.set("memory:///B.md", "# New");
  assert.equal(source.activeNode(0)?.label, "New");
  assert.equal(source.children({ id: "1", label: "Same" }).length, 0);
  source.set(undefined, "# Ignored");
  assert.equal(source.isEmpty, true);
  assert.equal(source.activeNode(0), undefined);
});

test("parents start collapsed by default; pathTo lists ancestors then self", () => {
  const text = "# Parent\n## Child\n### Deep\nbody\n## Sibling\n";
  const source = new OutlineSource();
  source.set("memory:///A.md", text);
  const roots = source.roots();
  assert.equal(roots[0]?.expanded, false);
  const deep = source.activeNode(text.indexOf("body"))!;
  assert.equal(deep.label, "Deep");
  assert.deepEqual(
    source.pathTo(deep).map((node) => node.label),
    ["Parent", "Child", "Deep"],
  );
  assert.equal(source.pathTo(deep).at(-1)?.id, deep.id);
});

test("parentsStartExpanded true restores expand-all-parents build", () => {
  const source = new OutlineSource();
  source.parentsStartExpanded = true;
  source.set("memory:///A.md", "# Parent\n## Child\n");
  assert.equal(source.roots()[0]?.expanded, true);
  assert.equal(
    source.children(source.roots()[0]!).some((node) => node.expanded === true),
    false,
    "leaf Child has no expanded flag",
  );
});

test("notes without headings and cursors in frontmatter have no active heading", () => {
  const source = new OutlineSource();
  source.set("memory:///A.md", "text\n```md\n# Code\n```\n");
  assert.equal(source.activeNode(12), undefined);
  source.set("memory:///A.md", "---\ntitle: Note\n---\n# Body");
  assert.equal(source.activeNode(8), undefined);
  assert.equal(source.activeNode(100)?.label, "Body");
});
