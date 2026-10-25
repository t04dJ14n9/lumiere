import assert from "node:assert/strict";
import test from "node:test";
import { EditorState } from "@codemirror/state";
import {
  documentTree,
  FIRST_PAINT_PARSE_CHARS,
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
