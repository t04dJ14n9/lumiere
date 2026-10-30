import test from "node:test";
import assert from "node:assert/strict";
import { openingEditorSelection } from "../../../src/plugins/editor/opening-selection";

test("a Search range is the editor's opening selection", () => {
  assert.deepEqual(openingEditorSelection(100, { anchor: 9, head: 34 }), {
    anchor: 9,
    head: 34,
  });
});

test("a caret at the start is not an opening selection", () => {
  assert.equal(openingEditorSelection(100, { anchor: 0, head: 0 }), undefined);
  assert.equal(openingEditorSelection(100, undefined), undefined);
});

test("an opening selection is clamped to the note", () => {
  assert.deepEqual(openingEditorSelection(10, { anchor: 4, head: 40 }), {
    anchor: 4,
    head: 10,
  });
});
