import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { lineSelectionFor } from "../../../src/plugins/lineNumbers/line-selection";

const state = (doc: string) =>
  EditorState.create({
    doc,
    extensions: EditorState.lineSeparator.of("\r\n"),
  });

test("a line selection ends at the next line's start with a CRLF separator", () => {
  const s = state("one\r\nnext");
  const one = s.doc.line(1);
  const sel = lineSelectionFor(s, one, one);
  assert.deepEqual([sel.main.from, sel.main.to], [0, 4]);
  assert.equal(s.sliceDoc(sel.main.from, sel.main.to), "one\r\n");
});

test("a CRLF line selection over the last break stays inside the document", () => {
  const s = state("one\r\n");
  const one = s.doc.line(1);
  const sel = lineSelectionFor(s, one, one);
  assert.equal(sel.main.to, s.doc.length);
  assert.doesNotThrow(() => s.update({ selection: sel }));
});

test("upward line selections keep the anchor line whole with CRLF", () => {
  const s = state("a\r\nb\r\nc");
  const sel = lineSelectionFor(s, s.doc.line(2), s.doc.line(1));
  assert.deepEqual([sel.main.anchor, sel.main.head], [4, 0]);
});
