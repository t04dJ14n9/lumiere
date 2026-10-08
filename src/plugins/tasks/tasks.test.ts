import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { taskEdit, checklistEdit } from "./edits";
test("checkbox changes check the expected line and preserve quotes, labels and custom states", () => {
  const text = "> 1. [?] 🧠 task\n- [ ] second";
  const edit = taskEdit(text, 0, "> 1. [?] 🧠 task", true)!;
  assert.equal(EditorState.create({ doc: text }).update({ changes: edit }).newDoc.toString(), "> 1. [x] 🧠 task\n- [ ] second");
  assert.equal(taskEdit(text, 0, "> 1. [ ] stale", true), undefined);
  assert.equal(taskEdit(text, 2, "missing", true), undefined);
  assert.equal(taskEdit("plain", 0, "plain", true), undefined);
});
test("checklist cycling preserves list identity and excludes a final column-zero line", () => {
  let state = EditorState.create({ doc: "- item\nuntouched", selection: { anchor: 0, head: 7 } });
  state = state.update(checklistEdit(state, true)).state;
  assert.equal(state.doc.toString(), "- [ ] item\nuntouched");
  state = state.update(checklistEdit(state, true)).state;
  assert.equal(state.doc.toString(), "- [x] item\nuntouched");
  state = state.update(checklistEdit(state, true)).state;
  assert.equal(state.doc.toString(), "- item\nuntouched");
});

test("cycling a completed task without trailing text preserves the next line", () => {
  const state = EditorState.create({ doc: "- [x]\nnext" });
  assert.equal(state.update(checklistEdit(state, true)).newDoc.toString(), "- \nnext");
});
