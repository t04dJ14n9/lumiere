import assert from "node:assert/strict";
import test from "node:test";
import { Text } from "@codemirror/state";
import { BlockType } from "@codemirror/view";
import { WidgetLineNumber, widgetLineNumber } from "./widgets";

const doc = Text.of([
  "# Note",
  "",
  "| a | b |",
  "| - | - |",
  "| 1 | 2 |",
  "end",
]);

test("a rendered block is numbered with its first source line", () => {
  const table = doc.line(3).from;
  const marker = widgetLineNumber(doc, {
    type: BlockType.WidgetRange,
    from: table,
  });
  assert.ok(marker instanceof WidgetLineNumber);
  assert.equal(marker.number, 3);
});

test("widgets that replace no source lines get no number", () => {
  for (const type of [
    BlockType.WidgetBefore,
    BlockType.WidgetAfter,
    BlockType.Text,
  ]) {
    assert.equal(widgetLineNumber(doc, { type, from: 0 }), null);
  }
});

test("markers for the same line compare equal, so the gutter keeps its cell", () => {
  assert.ok(new WidgetLineNumber(3).eq(new WidgetLineNumber(3)));
  assert.ok(!new WidgetLineNumber(3).eq(new WidgetLineNumber(4)));
});
