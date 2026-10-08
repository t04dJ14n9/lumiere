import { test } from "node:test";
import assert from "node:assert/strict";
import { SourceCoordinates } from "../../../src/shared/document/coordinates";

test("source selections and annotation positions round trip across mixed newlines and Unicode", () => {
  const source = "first\r\n你好 🧠\rthird\nlast";
  const positions = new SourceCoordinates(source);
  const from = positions.editor.line(2).from;
  const to = positions.editor.line(2).to;
  assert.equal(source.slice(positions.toSource(from), positions.toSource(to)), "你好 🧠");
  for (let offset = 0; offset <= positions.editor.length; offset++) {
    assert.equal(positions.toEditor(positions.toSource(offset)), offset);
  }
  assert.equal(positions.toSource(6), 7);
});

test("empty files, bounds and positions inside CRLF separators stay in range", () => {
  const empty = new SourceCoordinates("");
  assert.equal(empty.toSource(100), 0);
  assert.equal(empty.toEditor(-1), 0);
  const positions = new SourceCoordinates("one\r\ntwo");
  assert.equal(positions.toEditor(4), 3);
  assert.equal(positions.toEditor(5), 4);
  assert.equal(positions.toSource(100), 8);
});
