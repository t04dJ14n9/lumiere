import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { insertFootnote } from "./edit";
test("insertion uses an unused label, moves selection to its definition and supports EOF", () => {
  for (const source of ["", "[^1]: existing\n\nbody"]) {
    const state = EditorState.create({ doc: source, selection: { anchor: source.length } });
    const next = state.update(insertFootnote(state)).state;
    const label = source ? 2 : 1;
    assert.equal(next.doc.toString(), `${source}[^${label}]\n\n[^${label}]: `);
    assert.equal(next.selection.main.head, next.doc.length);
  }
  const state = EditorState.create({ doc: "some text", selection: { anchor: 0, head: 4 } });
  assert.equal(state.update(insertFootnote(state)).newDoc.toString(), "[^1] text\n\n[^1]: some");
});
