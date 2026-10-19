import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { pasteIntoListItem } from "../../../src/plugins/smartLists/paste";
import { renumberOnEdit } from "../../../src/plugins/smartLists/renumber";
import { markdownLanguageSupport } from "../../../src/markdown/dialect";

/** `text` pasted at the end of `line`, as the editor pastes it. */
function paste(line: string, text: string): [string, number] {
  const state = EditorState.create({
    doc: line,
    selection: { anchor: line.length },
    // As in the editor: filters run last first, so pasting is merged first.
    extensions: [markdownLanguageSupport(), renumberOnEdit, pasteIntoListItem],
  });
  const after = state.update({
    changes: { from: line.length, insert: text },
    selection: { anchor: line.length + text.length },
    userEvent: "input.paste",
  }).state;
  return [after.doc.toString(), after.selection.main.head];
}

// Every result below is Obsidian 1.14.4's for the same line and paste.
test("a list item pasted onto an empty one keeps one marker", () => {
  const cases: [string, string, string, number?][] = [
    ["- ", "- pasted item", "- pasted item", 13],
    ["- ", "- one\n- two", "- one\n- two"],
    ["1. ", "- bullet", "1. bullet"],
    ["- ", "1. num", "- num"],
    ["- ", "* star", "- star"],
    ["- ", "  - indented", "- indented", 10],
    ["  - ", "- nested paste", "  - nested paste"],
    ["  - ", "- a\n  - b\n- c", "  - a\n  - b\n- c", 15],
    ["1. ", "3. three\n4. four", "1. three\n2. four", 16],
  ];
  for (const [line, text, expected, caret] of cases) {
    const [result, head] = paste(line, text);
    assert.equal(result, expected, JSON.stringify([line, text]));
    if (caret !== undefined) {
      assert.equal(head, caret, JSON.stringify([line, text]));
    }
  }
});

test("a pasted checkbox takes the place of the line's", () => {
  assert.equal(paste("- ", "- [ ] task")[0], "- [ ] task");
  assert.equal(paste("- [x] ", "- [ ] t")[0], "- [ ] t");
  assert.equal(paste("- [ ] ", "- plain")[0], "- [ ] plain");
});

test("other pastes are left alone", () => {
  assert.equal(paste("> ", "> quoted")[0], "> > quoted");
  assert.equal(paste("- existing", "- pasted")[0], "- existing- pasted");
  assert.equal(paste("", "- plain line")[0], "- plain line");
  assert.equal(paste("- ", "-not a marker")[0], "- -not a marker");
  assert.equal(paste("- ", "text then\n- item")[0], "- text then\n- item");
});
