import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { insertCallout, isCallout } from "./edit";
// Expected notes are Obsidian's, measured in a throwaway vault (2026-10-17).
test("Insert Callout quotes the selected lines, apart from the text around, with its type selected", () => {
  const insert = (doc: string, anchor: number, head = anchor) => {
    const state = EditorState.create({ doc, selection: { anchor, head } });
    const next = state.update(insertCallout(state)).state;
    const { from, to } = next.selection.main;
    return `${next.doc.toString()} [${next.sliceDoc(from, to)}]`;
  };
  assert.equal(insert("one\ntwo", 0, 7), "> [!NOTE]\n> one\n> two [NOTE]");
  assert.equal(
    insert("above\none\ntwo\nbelow", 6, 13),
    "above\n\n> [!NOTE]\n> one\n> two\n\nbelow [NOTE]",
  );
  assert.equal(insert("text\n", 2), "> [!NOTE]\n> text\n [NOTE]");
  assert.equal(insert("", 0), "\n> [!NOTE] Title\n> Contents\n [NOTE]");
  assert.equal(
    insert("above\n\nbelow", 6),
    "above\n\n> [!NOTE] Title\n> Contents\n\nbelow [NOTE]",
  );
  assert.equal(isCallout("> [!NOTE]\n> one"), true);
  assert.equal(isCallout("> ordinary quote"), false);
  assert.equal(isCallout("> [!warning]- Custom"), true);
});
