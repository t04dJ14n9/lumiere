import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { ensureSyntaxTree } from "@codemirror/language";
import { insertNewlineAndIndent } from "@codemirror/commands";
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

test("Shift+Enter on an empty line under a list fills the continuation indent (BH-049)", () => {
  // Trailing EOF newline: caret on the empty line under the item (Host LP click/End).
  assert.equal(apply("- a\n|", continueLine), "- a\n  |");
  assert.equal(apply("- [ ] a\n|", continueLine), "- [ ] a\n      |");
  assert.equal(apply("1. a\n|", continueLine), "1. a\n   |");
  assert.equal(apply("> a\n|", continueLine), "> a\n> |");
  assert.equal(apply("- a\n  b\n|", continueLine), "- a\n  b\n  |");
  // Plain paragraph: still a bare break.
  assert.equal(apply("a\n|", continueLine), "a\n\n|");
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

test("deleting a list's first items keeps the number it started at, as in Obsidian 1.14.4", async () => {
  const { renumberOnEdit } =
    await import("../../../src/plugins/smartLists/renumber");
  const remove = (doc: string, from: number, to: number) =>
    EditorState.create({ doc, extensions: [renumberOnEdit] })
      .update({ changes: { from, to }, userEvent: "delete.backward" })
      .state.doc.toString();
  // Measured: the first item, from 1. and from 3.; the first two; a list
  // after a paragraph. Vim's `dd` deletes the same line.
  assert.equal(remove("1. a\n2. b\n3. c\n\nend", 0, 5), "1. b\n2. c\n\nend");
  assert.equal(remove("3. a\n4. b\n5. c\n\nend", 0, 5), "3. b\n4. c\n\nend");
  assert.equal(remove("1. a\n2. b\n3. c\n\nend", 0, 10), "1. c\n\nend");
  assert.equal(
    remove("para\n\n1. a\n2. b\n\nend", 6, 11),
    "para\n\n1. b\n\nend",
  );
  // A middle item: the list counts on from its first item, as before.
  assert.equal(remove("1. a\n2. b\n3. c\n\nend", 5, 10), "1. a\n2. c\n\nend");
});

test("Enter outside a list keeps the line's indentation, in a code block too, as in Obsidian", () => {
  // Not a list or a quote: Enter falls to CodeMirror's own newline.
  assert.equal(
    apply("```\n  code|\n```", insertNewlineAndIndent),
    "```\n  code\n  |\n```",
  );
  assert.equal(apply("plain|", insertNewlineAndIndent), "plain\n|");
});
