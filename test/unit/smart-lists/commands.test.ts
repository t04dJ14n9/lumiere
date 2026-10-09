import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { ensureSyntaxTree } from "@codemirror/language";
import { markdownLanguageSupport } from "../../../src/markdown/dialect";
import {
  continueList,
  removeMarker,
} from "../../../src/plugins/smartLists/commands";

type Command = typeof continueList;

/** Applies `command` with the caret at `|` and returns the text with `|`. */
function apply(text: string, command: Command): string {
  const head = text.indexOf("|");
  let state = EditorState.create({
    doc: text.replace("|", ""),
    selection: { anchor: head },
    extensions: [markdownLanguageSupport()],
  });
  ensureSyntaxTree(state, state.doc.length, 5000);
  const handled = command({
    state,
    dispatch: (tr) => {
      state = tr.state;
    },
  });
  assert.ok(handled, `not handled: ${JSON.stringify(text)}`);
  const at = state.selection.main.head;
  return state.sliceDoc(0, at) + "|" + state.sliceDoc(at);
}

test("Enter continues bullets, numbers, quotes and tasks", () => {
  assert.equal(apply("- one|", continueList), "- one\n- |");
  assert.equal(apply("* one|", continueList), "* one\n* |");
  assert.equal(apply("1. one|\n2. two", continueList), "1. one\n2. |\n3. two");
  assert.equal(apply("  - nested|", continueList), "  - nested\n  - |");
  assert.equal(apply("- [x] done|", continueList), "- [x] done\n- [ ] |");
  assert.equal(apply("- [ ] todo|", continueList), "- [ ] todo\n- [ ] |");
  assert.equal(apply("> quote|", continueList), "> quote\n> |");
});

test("Enter on an empty item leaves the list", () => {
  assert.equal(apply("- one\n- |", continueList), "- one\n|");
  assert.equal(apply("1. one\n2. |", continueList), "1. one\n|");
  assert.equal(apply("- [ ] one\n- [ ] |", continueList), "- [ ] one\n|");
  assert.equal(apply("- one\n  - |", continueList), "- one\n- |");
});

test("Enter outside lists is left to the default binding", () => {
  const state = EditorState.create({
    doc: "plain",
    selection: { anchor: 5 },
    extensions: [markdownLanguageSupport()],
  });
  assert.equal(continueList({ state, dispatch: () => undefined }), false);
});

test("Backspace after an empty item's marker removes the marker", () => {
  assert.equal(apply("- one\n- |", removeMarker), "- one\n|");
  assert.equal(apply("- one\n  - |", removeMarker), "- one\n  |");
  assert.equal(apply("1. |", removeMarker), "|");
  assert.equal(apply("- [ ] |", removeMarker), "|");
});
