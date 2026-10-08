import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { mathEdit } from "./commands";
test("math commands preserve selected formulas and unwrap the same source", () => {
  let state = EditorState.create({ doc: "x + 🧠", selection: { anchor: 0, head: 6 } });
  state = state.update(mathEdit(state, false)).state;
  assert.equal(state.doc.toString(), "$x + 🧠$");
  state = state.update(mathEdit(state, false)).state;
  assert.equal(state.doc.toString(), "x + 🧠");
  state = state.update(mathEdit(state, true)).state;
  assert.equal(state.doc.toString(), "$$\nx + 🧠\n$$\n");
});
