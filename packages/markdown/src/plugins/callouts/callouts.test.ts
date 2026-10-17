import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { insertCallout, isCallout } from "./edit";
test("callout insertion quotes every selected line in one source transaction", () => {
  const state = EditorState.create({
    doc: "one\ntwo",
    selection: { anchor: 0, head: 7 },
  });
  const next = state.update(insertCallout(state)).state;
  assert.equal(next.doc.toString(), "> [!note]\n> one\n> two\n");
  assert.equal(isCallout(next.doc.toString()), true);
  assert.equal(isCallout("> ordinary quote"), false);
  assert.equal(isCallout("> [!warning]- Custom"), true);
  assert.equal(next.selection.main.head, 12);
});
