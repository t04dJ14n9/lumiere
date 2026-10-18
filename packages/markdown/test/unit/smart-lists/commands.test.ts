import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { ensureSyntaxTree } from "@codemirror/language";
import { markdownLanguageSupport } from "../../../src/markdown/dialect";
import {
  continueLine,
  continueList,
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
  // Parse it all; the state gives the finished tree after a transaction.
  ensureSyntaxTree(state, state.doc.length, 5000);
  state = state.update({}).state;
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

test("Enter keeps the spaces before the caret, as Obsidian does", () => {
  assert.equal(apply("- |a", continueList), "- \n- |a");
  assert.equal(apply("1. |a", continueList), "1. \n2. |a");
  assert.equal(apply("- a |b", continueList), "- a \n- |b");
  assert.equal(apply("- [ ] |a", continueList), "- [ ] \n- [ ] |a");
});

test("Enter on an empty quoted line steps out one quote level", () => {
  assert.equal(apply("> a\n> |", continueList), "> a\n\n|");
  assert.equal(apply("> |", continueList), "\n|");
  assert.equal(apply("> a\n>|", continueList), "> a\n\n|");
  assert.equal(apply("> > a\n> > |", continueList), "> > a\n> \n> |");
});

test("Enter on an item's continuation line starts the next item", () => {
  assert.equal(apply("- a\n  b|", continueList), "- a\n  b\n- |");
  assert.equal(
    apply("1. a\n   b|\n2. c", continueList),
    "1. a\n   b\n2. |\n3. c",
  );
  assert.equal(apply("- [x] a\n  b|", continueList), "- [x] a\n  b\n- [ ] |");
});

test("Shift+Enter breaks the line inside the item, lined up with its text", () => {
  assert.equal(apply("- a|", continueLine), "- a\n  |");
  assert.equal(apply("1. a|", continueLine), "1. a\n   |");
  assert.equal(apply("- [ ] a|", continueLine), "- [ ] a\n      |");
  assert.equal(apply("\t- a|", continueLine), "\t- a\n\t  |");
  assert.equal(apply("> a|", continueLine), "> a\n> |");
  assert.equal(apply("- a|b", continueLine), "- a\n  |b");
  assert.equal(apply("- a\n  |", continueLine), "- a\n  \n  |");
  assert.equal(apply("a|", continueLine), "a\n|");
});

test("an edit inside an ordered list numbers it again, as in Obsidian", async () => {
  const { renumberOnEdit } =
    await import("../../../src/plugins/smartLists/renumber");
  const edit = (
    doc: string,
    at: number,
    insert: string,
    userEvent?: string,
  ) => {
    const state = EditorState.create({ doc, extensions: [renumberOnEdit] });
    return state
      .update({
        changes: { from: at, insert },
        ...(userEvent ? { userEvent } : {}),
      })
      .state.doc.toString();
  };
  assert.equal(
    edit("1. a\n1. b\n1. c\n\nx", 9, "z", "input.type"),
    "1. a\n2. bz\n3. c\n\nx",
  );
  // Edits elsewhere, and changes that are not typing (sync, undo), leave it.
  assert.equal(
    edit("1. a\n1. b\n\nx", 12, "y", "input.type"),
    "1. a\n1. b\n\nxy",
  );
  assert.equal(edit("1. a\n1. b\n\nx", 9, "z"), "1. a\n1. bz\n\nx");
  // A deleted item renumbers the rest.
  const state = EditorState.create({
    doc: "1. a\n2. b\n3. c",
    extensions: [renumberOnEdit],
  });
  assert.equal(
    state
      .update({ changes: { from: 4, to: 9 }, userEvent: "delete.backward" })
      .state.doc.toString(),
    "1. a\n2. c",
  );
});
