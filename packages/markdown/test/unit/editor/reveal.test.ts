import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { propertyCaretGuard } from "../../../src/plugins/properties/caret-guard";
import { revealUnchanged } from "../../../src/plugins/editor/navigation";
test("reveals acknowledge the front-matter guard's effective range but reject later input", () => {
  const initial = EditorState.create({
    doc: "---\ntitle: T\n---\nBody\n",
    extensions: [propertyCaretGuard(() => true)],
  });
  for (const head of [0, 16]) {
    const applied = initial.update({ selection: { anchor: 0, head } }).state;
    assert.equal(applied.selection.main.anchor, 17);
    assert.equal(revealUnchanged(applied, applied), true);
    const moved = applied.update({ selection: { anchor: 19 } }).state;
    assert.equal(revealUnchanged(applied, moved), false);
    const edited = applied.update({ changes: { from: 20, insert: "!" } }).state;
    assert.equal(revealUnchanged(applied, edited), false);
  }
});
