import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { normalCaretOnText } from "./normal-caret";

const at = (doc: string, head: number) =>
  EditorState.create({ doc, selection: { anchor: head } });

test("in normal mode a caret after a line's last character goes back onto it", () => {
  // `A`, `def`, Escape, `u`: the undo leaves the caret after "abc".
  assert.equal(normalCaretOnText(at("abc\n\nend", 3), {}), 2);
  assert.equal(normalCaretOnText(at("abc\n\nend", 2), {}), undefined);
  // An empty line has only one place.
  assert.equal(normalCaretOnText(at("abc\n\nend", 4), {}), undefined);
});

test("insert and visual mode, and selections, keep the caret where it is", () => {
  assert.equal(
    normalCaretOnText(at("abc", 3), { insertMode: true }),
    undefined,
  );
  assert.equal(
    normalCaretOnText(at("abc", 3), { visualMode: true }),
    undefined,
  );
  assert.equal(normalCaretOnText(at("abc", 3), undefined), undefined);
  const selected = EditorState.create({
    doc: "abc",
    selection: { anchor: 1, head: 3 },
  });
  assert.equal(normalCaretOnText(selected, {}), undefined);
});
