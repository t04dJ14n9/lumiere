import assert from "node:assert/strict";
import test from "node:test";
import { EditorState } from "@codemirror/state";
import { BlockType } from "@codemirror/view";
import { markdownLanguageSupport } from "../../markdown/dialect";
import { LineNumberMarker, blockLabel, lineLabel } from "./gutter";

test("labels follow VS Code's editor.lineNumbers styles", () => {
  const labels = (style: Parameters<typeof lineLabel>[2]) =>
    [1, 9, 10, 11, 20].map((n) => lineLabel(n, 11, style));
  assert.deepEqual(labels("on"), ["1", "9", "10", "11", "20"]);
  assert.deepEqual(labels("relative"), ["10", "2", "1", "11", "9"]);
  assert.deepEqual(labels("interval"), ["", "", "10", "11", "20"]);
  assert.deepEqual(labels("off"), ["", "", "", "", ""]);
});

const state = EditorState.create({
  doc: ["# Note", "", "| a | b |", "| - | - |", "| 1 | 2 |", "end"].join("\n"),
  selection: { anchor: 0 },
});

test("a rendered block gets one number, that of its first source line (as in Obsidian)", () => {
  const table = { from: state.doc.line(3).from, to: state.doc.line(5).to };
  const block = { ...table, type: BlockType.WidgetRange };
  assert.equal(blockLabel(state, block, "on"), "3");
  assert.equal(blockLabel(state, block, "relative"), "2");
  assert.equal(blockLabel(state, block, "off"), "");
});

test("text lines get one number and widgets that replace nothing get none", () => {
  const line = state.doc.line(6);
  assert.equal(
    blockLabel(state, { from: line.from, type: BlockType.Text }, "on"),
    "6",
  );
  for (const type of [BlockType.WidgetBefore, BlockType.WidgetAfter]) {
    assert.equal(blockLabel(state, { from: 0, type }, "on"), null);
  }
});

test("markers with the same label compare equal, so the gutter keeps its cell", () => {
  assert.ok(new LineNumberMarker("3").eq(new LineNumberMarker("3")));
  assert.ok(!new LineNumberMarker("3").eq(new LineNumberMarker("4")));
  assert.ok(!new LineNumberMarker("3").eq(new LineNumberMarker("3", "table")));
});

test("frontmatter has no labels while body lines keep their source numbers", () => {
  const state = EditorState.create({
    doc: "---\ntitle: Note\ntags:\n  - one\n  - two\naliases: []\n---\nBody\nEnd",
    extensions: markdownLanguageSupport(),
  });
  for (const type of [BlockType.Text, BlockType.WidgetRange]) {
    for (let number = 1; number <= 7; number++) {
      assert.equal(
        blockLabel(state, { from: state.doc.line(number).from, type }, "on"),
        null,
      );
    }
  }
  assert.equal(
    blockLabel(
      state,
      { from: state.doc.line(8).from, type: BlockType.Text },
      "on",
    ),
    "8",
  );
  assert.equal(
    blockLabel(
      state,
      { from: state.doc.line(9).from, type: BlockType.Text },
      "on",
    ),
    "9",
  );
});
