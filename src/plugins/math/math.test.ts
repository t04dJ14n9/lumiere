import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { mathEdit } from "./commands";
test("math commands preserve selected formulas and unwrap the same source", () => {
  let state = EditorState.create({
    doc: "x + 🧠",
    selection: { anchor: 0, head: 6 },
  });
  state = state.update(mathEdit(state, false)).state;
  assert.equal(state.doc.toString(), "$x + 🧠$");
  state = state.update(mathEdit(state, false)).state;
  assert.equal(state.doc.toString(), "x + 🧠");
  state = state.update(mathEdit(state, true)).state;
  assert.equal(state.doc.toString(), "$$\nx + 🧠\n$$\n");
});

test("display math inserts a leading newline only inside an existing line", () => {
  for (const [doc, from, expected] of [
    ["abc", 1, "a\n$$\n\n$$\nbc"],
    ["a\nb", 2, "a\n$$\n\n$$\nb"],
    ["", 0, "$$\n\n$$\n"],
  ] as const) {
    const state = EditorState.create({ doc, selection: { anchor: from } });
    const result = state.update(mathEdit(state, true)).state;
    assert.equal(result.doc.toString(), expected);
    assert.equal(
      result.sliceDoc(result.selection.main.from, result.selection.main.to),
      "",
    );
  }
});
