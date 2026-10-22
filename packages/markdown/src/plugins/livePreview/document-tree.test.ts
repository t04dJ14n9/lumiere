import assert from "node:assert/strict";
import test from "node:test";
import { EditorState } from "@codemirror/state";
import {
  documentTree,
  FIRST_PAINT_PARSE_CHARS,
  FIRST_PAINT_PARSE_MAX,
  firstPaintParseEnd,
  parseForFirstPaint,
  replaceDocumentTree,
} from "./document-tree";
import { parseMarkdown } from "../../markdown/dialect";

test("parseForFirstPaint keeps small notes complete", () => {
  const doc = "hello\n\n# Title\n";
  const tree = parseForFirstPaint(EditorState.create({ doc }).doc);
  assert.equal(tree.length, doc.length);
});

test("parseForFirstPaint truncates large notes to the opening band", () => {
  const line = "word ".repeat(40) + "\n";
  const doc = line.repeat(800);
  assert.ok(doc.length > FIRST_PAINT_PARSE_CHARS * 2);
  const state = EditorState.create({ doc });
  const tree = parseForFirstPaint(state.doc);
  assert.ok(
    tree.length <= FIRST_PAINT_PARSE_CHARS + 200,
    `prefix tree length ${tree.length} within a line of the budget`,
  );
  assert.ok(tree.length < state.doc.length);
});

test("parseForFirstPaint extends through a long frontmatter fence plus body", () => {
  const sources = Array.from(
    { length: 200 },
    (_, i) =>
      `- id: src-${i}\n  resource: https://example.com/path/to/resource/${i}\n  title: Source row ${i} with a longer title for bytes\n`,
  ).join("");
  const body =
    "# Title\n\nOpening paragraph after properties.\n\n" +
    ("word ".repeat(40) + "\n").repeat(800);
  const doc = `---\ntype: Task\ntitle: Wave 11\nsources:\n${sources}---\n\n${body}`;
  assert.ok(doc.length > FIRST_PAINT_PARSE_CHARS * 2);
  const fence = /^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)\r?(?:\n|$)/.exec(doc);
  assert.ok(fence);
  assert.ok(
    fence![0].length > FIRST_PAINT_PARSE_CHARS,
    `fence ${fence![0].length} must exceed opening band ${FIRST_PAINT_PARSE_CHARS}`,
  );

  const state = EditorState.create({ doc });
  const end = firstPaintParseEnd(state.doc);
  assert.ok(end > fence![0].length);
  assert.ok(end <= FIRST_PAINT_PARSE_MAX);
  assert.ok(end < state.doc.length);

  const tree = parseForFirstPaint(state.doc);
  assert.equal(tree.length, end);

  let frontmatterTo = -1;
  let headingFrom = -1;
  tree.iterate({
    enter(node) {
      if (node.name === "Frontmatter" && frontmatterTo < 0) {
        frontmatterTo = node.to;
      }
      if (node.name.startsWith("ATXHeading") && headingFrom < 0) {
        headingFrom = node.from;
      }
    },
  });
  // Lezer Frontmatter ends at the closing fence (may omit the final newline).
  assert.ok(
    frontmatterTo >= fence![0].length - 2 && frontmatterTo <= fence![0].length,
    `Frontmatter ends at ${frontmatterTo}, fence length ${fence![0].length}`,
  );
  assert.ok(headingFrom >= frontmatterTo, "heading follows complete frontmatter");
});

test("documentTree create uses a prefix tree; replaceDocumentTree completes it", () => {
  const line = "word ".repeat(40) + "\n";
  const doc = line.repeat(800);
  const state = EditorState.create({
    doc,
    extensions: [documentTree],
  });
  const prefix = state.field(documentTree);
  assert.ok(prefix.length < state.doc.length);
  const full = parseMarkdown(state.doc);
  const next = state.update({ effects: replaceDocumentTree.of(full) }).state;
  assert.equal(next.field(documentTree).length, state.doc.length);
});
