import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { ensureSyntaxTree, indentUnit } from "@codemirror/language";
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
test("Enter continues space-indented nests with spaces when useTabs is on (BH-051)", () => {
  assert.equal(
    applyTabs("- alpha\n  - nested\n    - deep|"),
    "- alpha\n  - nested\n    - deep\n    - |",
  );
  assert.equal(applyTabs("- one\n  - two|"), "- one\n  - two\n  - |");
});

test("Enter on empty tab item under spaces outdents without corrupting the marker (BH-051)", () => {
  assert.equal(
    applyTabs("- alpha\n  - nested\n    - deep\n\t- |"),
    "- alpha\n  - nested\n    - deep\n  - |",
  );
  assert.equal(
    applyTabs("- alpha\n  - nested\n    - deep\n    - |"),
    "- alpha\n  - nested\n    - deep\n  - |",
  );
});

/** Like `apply`, but with indentUnit tab (editor default useTabs). */
function applyTabs(text: string): string {
  const head = text.indexOf("|");
  let state = EditorState.create({
    doc: text.replace("|", ""),
    selection: { anchor: head },
    extensions: [
      markdownLanguageSupport(),
      indentUnit.of("\t"),
      EditorState.tabSize.of(4),
    ],
  });
  ensureSyntaxTree(state, state.doc.length, 5000);
  state = state.update({}).state;
  const handled = continueList({
    state,
    dispatch: (tr) => {
      state = tr.state;
    },
  });
  assert.ok(handled, `not handled: ${JSON.stringify(text)}`);
  const at = state.selection.main.head;
  return state.sliceDoc(0, at) + "|" + state.sliceDoc(at);
}

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

test("Enter in a setext heading exits below the underline (BH-059)", () => {
  assert.equal(
    apply("Title|\n=========\n\nbody", continueList),
    "Title\n=========\n|\n\nbody",
  );
  assert.equal(apply("Title\n---------|", continueList), "Title\n---------\n|");
  assert.equal(
    apply("Hello| world\n---------\n\nbody", continueList),
    "Hello\n---------\n| world\n\nbody",
  );
  assert.equal(
    apply("|Title\n=========\n\nbody", continueList),
    "Title\n=========\n|\n\nbody",
  );
});

test("Shift+Enter in a setext heading exits below the underline (BH-076)", () => {
  assert.equal(
    apply("Title|\n=========\n\nbody", continueLine),
    "Title\n=========\n|\n\nbody",
  );
  assert.equal(apply("Title\n---------|", continueLine), "Title\n---------\n|");
  assert.equal(
    apply("Hello| world\n---------\n\nbody", continueLine),
    "Hello\n---------\n| world\n\nbody",
  );
  assert.equal(
    apply("|Title\n=========\n\nbody", continueLine),
    "Title\n=========\n|\n\nbody",
  );
  assert.equal(
    apply("> Title|\n> =========", continueLine),
    "> Title\n> =========\n> |",
  );
});

test("Enter/Shift+Enter on quoted setext exits with quote prefix (BH-082)", () => {
  assert.equal(
    apply("> Title|\n> =========", continueList),
    "> Title\n> =========\n> |",
  );
  assert.equal(
    apply("> Hello| world\n> ---------", continueLine),
    "> Hello\n> ---------\n> | world",
  );
  assert.equal(
    apply("> Hello| world\n> ---------", continueList),
    "> Hello\n> ---------\n> | world",
  );
  assert.equal(
    apply("> |Title\n> =========", continueLine),
    "> Title\n> =========\n> |",
  );
  assert.equal(
    apply("> > Title|\n> > =========", continueLine),
    "> > Title\n> > =========\n> > |",
  );
  assert.equal(
    apply("> Title\n> =========|", continueLine),
    "> Title\n> =========\n> |",
  );
});

test("Enter on a footnote definition continues with a tab indent (BH-060)", () => {
  assert.equal(
    apply("[^a]: first line|", continueList),
    "[^a]: first line\n\t|",
  );
  assert.equal(
    apply("[^a]: first| second", continueList),
    "[^a]: first\n\t| second",
  );
  assert.equal(
    apply("[^note]: named|\n\nbody", continueList),
    "[^note]: named\n\t|\n\nbody",
  );
});

test("Enter on a footnote continuation keeps indent; empty leaves (BH-060)", () => {
  assert.equal(
    apply("[^a]: first\n\tcontinued|", continueList),
    "[^a]: first\n\tcontinued\n\t|",
  );
  assert.equal(
    apply("[^a]: first\n    spaced|", continueList),
    "[^a]: first\n    spaced\n    |",
  );
  assert.equal(apply("[^a]: first\n\t|", continueList), "[^a]: first\n|");
  assert.equal(apply("[^a]: first\n    |", continueList), "[^a]: first\n|");
});

test("Enter does not treat a list under a footnote as footnote body (BH-060)", () => {
  // Fall through to smart-list / default; must not become indent-only "  |".
  const head = "[^a]: def\n  - item|".indexOf("|");
  let state = EditorState.create({
    doc: "[^a]: def\n  - item",
    selection: { anchor: head },
    extensions: [markdownLanguageSupport()],
  });
  ensureSyntaxTree(state, state.doc.length, 5000);
  state = state.update({}).state;
  continueList({
    state,
    dispatch: (tr) => {
      state = tr.state;
    },
  });
  assert.equal(
    state.doc.toString().includes("\n  |") ||
      /\n {2}$/u.test(state.doc.toString()),
    false,
  );
  assert.match(state.doc.toString(), /- item/);
});

test("Enter on a link reference definition continues with a tab indent (BH-072)", () => {
  assert.equal(
    apply("[lab]: https://ex.com|", continueList),
    "[lab]: https://ex.com\n\t|",
  );
  assert.equal(
    apply("[lab]: first| second", continueList),
    "[lab]: first\n\t| second",
  );
  assert.equal(
    apply("[ref]: named|\n\nbody", continueList),
    "[ref]: named\n\t|\n\nbody",
  );
});

test("Enter on a link-ref continuation keeps indent; empty leaves (BH-072)", () => {
  assert.equal(
    apply("[lab]: first\n\tcontinued|", continueList),
    "[lab]: first\n\tcontinued\n\t|",
  );
  assert.equal(
    apply("[lab]: first\n    spaced|", continueList),
    "[lab]: first\n    spaced\n    |",
  );
  assert.equal(apply("[lab]: first\n\t|", continueList), "[lab]: first\n|");
  assert.equal(apply("[lab]: first\n    |", continueList), "[lab]: first\n|");
});

test("Enter does not treat a list under a link-ref as link-ref body (BH-072)", () => {
  // Fall through to smart-list / default; must not become indent-only "  |".
  const head = "[lab]: def\n  - item|".indexOf("|");
  let state = EditorState.create({
    doc: "[lab]: def\n  - item",
    selection: { anchor: head },
    extensions: [markdownLanguageSupport()],
  });
  ensureSyntaxTree(state, state.doc.length, 5000);
  state = state.update({}).state;
  continueList({
    state,
    dispatch: (tr) => {
      state = tr.state;
    },
  });
  assert.equal(
    state.doc.toString().includes("\n  |") ||
      /\n {2}$/u.test(state.doc.toString()),
    false,
  );
  assert.match(state.doc.toString(), /- item/);
});

test("Enter on footnote still wins over link-ref pattern (BH-060 / BH-072)", () => {
  assert.equal(apply("[^n]: body|", continueList), "[^n]: body\n\t|");
});

test("Enter on a quoted footnote definition continues with quote+tab (BH-073)", () => {
  assert.equal(apply("> [^a]: body|", continueList), "> [^a]: body\n> \t|");
  assert.equal(
    apply("> [^a]: first| second", continueList),
    "> [^a]: first\n> \t| second",
  );
  assert.equal(
    apply("> > [^note]: deep|", continueList),
    "> > [^note]: deep\n> > \t|",
  );
});

test("Enter on a quoted footnote continuation keeps indent; empty leaves (BH-073)", () => {
  assert.equal(
    apply("> [^a]: first\n> \tcontinued|", continueList),
    "> [^a]: first\n> \tcontinued\n> \t|",
  );
  assert.equal(
    apply("> [^a]: first\n>     spaced|", continueList),
    "> [^a]: first\n>     spaced\n>     |",
  );
  assert.equal(apply("> [^a]: first\n> \t|", continueList), "> [^a]: first\n|");
  assert.equal(
    apply("> [^a]: first\n>     |", continueList),
    "> [^a]: first\n|",
  );
});

test("Enter does not treat a list under a quoted footnote as footnote body (BH-073)", () => {
  const head = "> [^a]: def\n>   - item|".indexOf("|");
  let state = EditorState.create({
    doc: "> [^a]: def\n>   - item",
    selection: { anchor: head },
    extensions: [markdownLanguageSupport()],
  });
  ensureSyntaxTree(state, state.doc.length, 5000);
  state = state.update({}).state;
  continueList({
    state,
    dispatch: (tr) => {
      state = tr.state;
    },
  });
  assert.equal(
    state.doc.toString().includes("\n>   |") ||
      /\n> {2}$/u.test(state.doc.toString()),
    false,
  );
  assert.match(state.doc.toString(), /- item/);
});
test("Enter on a quoted link reference continues with quote+tab (BH-075)", () => {
  assert.equal(apply("> [lab]: url|", continueList), "> [lab]: url\n> \t|");
  assert.equal(
    apply("> [lab]: first| second", continueList),
    "> [lab]: first\n> \t| second",
  );
  assert.equal(apply("> > [deep]: x|", continueList), "> > [deep]: x\n> > \t|");
});

test("Enter on a quoted link-ref continuation keeps indent; empty leaves (BH-075)", () => {
  assert.equal(
    apply("> [lab]: first\n> \tcontinued|", continueList),
    "> [lab]: first\n> \tcontinued\n> \t|",
  );
  assert.equal(
    apply("> [lab]: first\n>     spaced|", continueList),
    "> [lab]: first\n>     spaced\n>     |",
  );
  assert.equal(
    apply("> [lab]: first\n> \t|", continueList),
    "> [lab]: first\n|",
  );
  assert.equal(
    apply("> [lab]: first\n>     |", continueList),
    "> [lab]: first\n|",
  );
});

test("Enter does not treat a list under a quoted link-ref as link-ref body (BH-075)", () => {
  const head = "> [lab]: def\n>   - item|".indexOf("|");
  let state = EditorState.create({
    doc: "> [lab]: def\n>   - item",
    selection: { anchor: head },
    extensions: [markdownLanguageSupport()],
  });
  ensureSyntaxTree(state, state.doc.length, 5000);
  state = state.update({}).state;
  continueList({
    state,
    dispatch: (tr) => {
      state = tr.state;
    },
  });
  assert.equal(
    state.doc.toString().includes("\n>   |") ||
      /\n> {2}$/u.test(state.doc.toString()),
    false,
  );
  assert.match(state.doc.toString(), /- item/);
});

test("Shift+Enter on a footnote definition soft-breaks with a tab indent (BH-077)", () => {
  assert.equal(
    apply("[^a]: first line|", continueLine),
    "[^a]: first line\n\t|",
  );
  assert.equal(
    apply("[^a]: first| second", continueLine),
    "[^a]: first\n\t| second",
  );
  assert.equal(
    apply("  [^note]: spaced|", continueLine),
    "  [^note]: spaced\n\t|",
  );
  assert.equal(
    apply("[^a]: first\n\tcontinued|", continueLine),
    "[^a]: first\n\tcontinued\n\t|",
  );
  // Empty continuation soft-breaks (does not leave, unlike Enter).
  assert.equal(apply("[^a]: first\n\t|", continueLine), "[^a]: first\n\t\n\t|");
  // Empty line under a footnote fills the body indent (BH-049 sibling).
  assert.equal(apply("[^a]: first\n|", continueLine), "[^a]: first\n\t|");
});

test("Shift+Enter on a link reference soft-breaks with a tab indent (BH-079)", () => {
  assert.equal(
    apply("[lab]: https://ex.com|", continueLine),
    "[lab]: https://ex.com\n\t|",
  );
  assert.equal(
    apply("[lab]: first| second", continueLine),
    "[lab]: first\n\t| second",
  );
  assert.equal(apply("  [ref]: spaced|", continueLine), "  [ref]: spaced\n\t|");
  assert.equal(
    apply("[lab]: url\n\tcontinued|", continueLine),
    "[lab]: url\n\tcontinued\n\t|",
  );
  assert.equal(apply("[lab]: url\n\t|", continueLine), "[lab]: url\n\t\n\t|");
  assert.equal(apply("[lab]: url\n|", continueLine), "[lab]: url\n\t|");
});

test("Shift+Enter on a quoted footnote soft-breaks with quote+tab (BH-080)", () => {
  assert.equal(apply("> [^a]: body|", continueLine), "> [^a]: body\n> \t|");
  assert.equal(
    apply("> [^a]: first| second", continueLine),
    "> [^a]: first\n> \t| second",
  );
  assert.equal(
    apply("> > [^note]: deep|", continueLine),
    "> > [^note]: deep\n> > \t|",
  );
  assert.equal(
    apply("> [^a]: first\n> \tcontinued|", continueLine),
    "> [^a]: first\n> \tcontinued\n> \t|",
  );
  // Empty quoted continuation soft-breaks (does not leave, unlike Enter).
  assert.equal(
    apply("> [^a]: first\n> \t|", continueLine),
    "> [^a]: first\n> \t\n> \t|",
  );
  // Empty line under a quoted footnote fills quote+tab.
  assert.equal(apply("> [^a]: first\n|", continueLine), "> [^a]: first\n> \t|");
});

test("Shift+Enter on a quoted link reference soft-breaks with quote+tab (BH-081)", () => {
  assert.equal(
    apply("> [lab]: https://ex.com|", continueLine),
    "> [lab]: https://ex.com\n> \t|",
  );
  assert.equal(
    apply("> [lab]: first| second", continueLine),
    "> [lab]: first\n> \t| second",
  );
  assert.equal(
    apply("> > [note]: url|", continueLine),
    "> > [note]: url\n> > \t|",
  );
  assert.equal(
    apply("> [lab]: url\n> \tcontinued|", continueLine),
    "> [lab]: url\n> \tcontinued\n> \t|",
  );
  assert.equal(
    apply("> [lab]: url\n> \t|", continueLine),
    "> [lab]: url\n> \t\n> \t|",
  );
  assert.equal(apply("> [lab]: url\n|", continueLine), "> [lab]: url\n> \t|");
});

test("Enter in an ATX heading exits below the heading (BH-084)", () => {
  assert.equal(apply("# Title|", continueList), "# Title\n|");
  assert.equal(apply("## Hello| world", continueList), "## Hello\n| world");
  assert.equal(apply("# |Title", continueList), "# Title\n|");
  assert.equal(apply("> # Title|", continueList), "> # Title\n> |");
  assert.equal(apply("> # |Title", continueList), "> # Title\n> |");
  assert.equal(apply("> # Hello| world", continueList), "> # Hello\n> | world");
  assert.equal(apply("- # Title|", continueList), "- # Title\n- |");
  assert.equal(apply("- # |Title", continueList), "- # Title\n- |");
});

test("Enter on empty ATX heading unwraps marker (BH-084)", () => {
  assert.equal(apply("# |", continueList), "|");
  assert.equal(apply("## |", continueList), "|");
  assert.equal(apply("> # |", continueList), "> |");
  assert.equal(apply("- # |", continueList), "- |");
  assert.equal(apply("> - # |", continueList), "> - |");
  assert.equal(apply("- [ ] # |", continueList), "- [ ] |");
});

test("Shift+Enter in an ATX heading exits below the heading (BH-084)", () => {
  assert.equal(apply("# Title|", continueLine), "# Title\n|");
  assert.equal(apply("## Hello| world", continueLine), "## Hello\n| world");
  assert.equal(apply("# |Title", continueLine), "# Title\n|");
  assert.equal(apply("> # |Title", continueLine), "> # Title\n> |");
  assert.equal(apply("- # Hello| world", continueLine), "- # Hello\n  | world");
  assert.equal(apply("- # |Title", continueLine), "- # Title\n  |");
  assert.equal(apply("# |", continueLine), "|");
  assert.equal(apply("> # |", continueLine), "> |");
});
test("Enter at callout title content start exits below intact (BH-085)", () => {
  assert.equal(apply("> [!NOTE] |Title", continueList), "> [!NOTE] Title\n> |");
  assert.equal(
    apply("> [!NOTE]- |Title", continueList),
    "> [!NOTE]- Title\n> |",
  );
  assert.equal(
    apply("> [!NOTE]+ |Folded", continueList),
    "> [!NOTE]+ Folded\n> |",
  );
  assert.equal(
    apply("> > [!TIP] |Deep", continueList),
    "> > [!TIP] Deep\n> > |",
  );
  // Mid / EOL still start body (quote continue).
  assert.equal(
    apply("> [!NOTE] Hello| world", continueList),
    "> [!NOTE] Hello\n> | world",
  );
  assert.equal(apply("> [!NOTE] Title|", continueList), "> [!NOTE] Title\n> |");
});

test("Enter on empty callout title unwraps opener (BH-086)", () => {
  assert.equal(apply("> [!NOTE] |", continueList), "> |");
  assert.equal(apply("> [!NOTE]- |", continueList), "> |");
  assert.equal(apply("> [!NOTE]+ |", continueList), "> |");
  assert.equal(apply("> [!WARNING] |", continueList), "> |");
  assert.equal(apply("> > [!TIP] |", continueList), "> > |");
  assert.equal(apply("> [!NOTE]\t|", continueList), "> |");
  // Empty quote (no callout) still leaves the quote level.
  assert.equal(apply("> |", continueList), "\n|");
});

test("Shift+Enter at callout title content start exits below intact (BH-085)", () => {
  assert.equal(apply("> [!NOTE] |Title", continueLine), "> [!NOTE] Title\n> |");
  assert.equal(
    apply("> [!WARNING]- |Hi", continueLine),
    "> [!WARNING]- Hi\n> |",
  );
});

test("Shift+Enter on empty callout title unwraps opener (BH-086)", () => {
  assert.equal(apply("> [!NOTE] |", continueLine), "> |");
  assert.equal(apply("> [!NOTE]- |", continueLine), "> |");
  assert.equal(apply("> [!abstract]+ |", continueLine), "> |");
  assert.equal(apply("> > [!NOTE] |", continueLine), "> > |");
});

test("Enter on empty footnote definition unwraps marker (BH-091)", () => {
  assert.equal(apply("[^a]: |", continueList), "|");
  assert.equal(apply("[^a]:|", continueList), "|");
  assert.equal(apply("[^note]: |", continueList), "|");
  assert.equal(apply("  [^a]: |", continueList), "|");
  assert.equal(apply("> [^a]: |", continueList), "> |");
  assert.equal(apply("> > [^tip]: |", continueList), "> > |");
  assert.equal(apply("[^a]:\t|", continueList), "|");
  // Non-empty body still continues with tab (BH-060).
  assert.equal(apply("[^a]: body|", continueList), "[^a]: body\n\t|");
  // Empty quote (no footnote) still leaves the quote level.
  assert.equal(apply("> |", continueList), "\n|");
});

test("Shift+Enter on empty footnote definition unwraps marker (BH-091)", () => {
  assert.equal(apply("[^a]: |", continueLine), "|");
  assert.equal(apply("[^a]:|", continueLine), "|");
  assert.equal(apply("> [^a]: |", continueLine), "> |");
  assert.equal(apply("> > [^note]: |", continueLine), "> > |");
  // Non-empty: Shift+Enter still soft-breaks with tab (BH-077).
  assert.equal(apply("[^a]: body|", continueLine), "[^a]: body\n\t|");
});

test("Enter on empty link reference unwraps marker (BH-092)", () => {
  assert.equal(apply("[label]: |", continueList), "|");
  assert.equal(apply("[label]:|", continueList), "|");
  assert.equal(apply("[ref]: |", continueList), "|");
  assert.equal(apply("  [x]: |", continueList), "|");
  assert.equal(apply("> [label]: |", continueList), "> |");
  assert.equal(apply("> > [label]: |", continueList), "> > |");
  assert.equal(apply("[label]:\t|", continueList), "|");
  // Footnote empty also unwraps via BH-091.
  assert.equal(apply("[^a]: |", continueList), "|");
  // Non-empty destination still continues with tab via BH-072.
  assert.equal(
    apply("[label]: https://example.com|", continueList),
    "[label]: https://example.com\n\t|",
  );
  assert.equal(apply("> |", continueList), "\n|");
});

test("Shift+Enter on empty link reference unwraps marker (BH-092)", () => {
  assert.equal(apply("[label]: |", continueLine), "|");
  assert.equal(apply("[label]:|", continueLine), "|");
  assert.equal(apply("> [label]: |", continueLine), "> |");
  assert.equal(apply("> > [ref]: |", continueLine), "> > |");
  // Non-empty destination still soft-breaks with tab via BH-079.
  assert.equal(
    apply("[label]: https://example.com|", continueLine),
    "[label]: https://example.com\n\t|",
  );
});

test("Shift+Enter on thematic break does not list-indent (BH-093)", () => {
  assert.equal(apply("- - -|", continueLine), "- - -\n|");
  assert.equal(apply("* * *|", continueLine), "* * *\n|");
  assert.equal(apply("_ _ _|", continueLine), "_ _ _\n|");
  assert.equal(apply("---|", continueLine), "---\n|");
  assert.equal(apply("***|", continueLine), "***\n|");
  assert.equal(apply("___|", continueLine), "___\n|");
  assert.equal(apply("- - - -|", continueLine), "- - - -\n|");
  assert.equal(apply("   ---|", continueLine), "   ---\n|");
  assert.equal(apply("> - - -|", continueLine), "> - - -\n> |");
  assert.equal(apply("> ---|", continueLine), "> ---\n> |");
  assert.equal(apply("> > * * *|", continueLine), "> > * * *\n> > |");
  // Real list item still gets continuation indent (BH-049).
  assert.equal(apply("- item|", continueLine), "- item\n  |");
  assert.equal(apply("* item|", continueLine), "* item\n  |");
  // Empty line under spaced HR does not fill list indent.
  assert.equal(apply("- - -\n|", continueLine), "- - -\n|");
  assert.equal(apply("---\n|", continueLine), "---\n|");
});

test("Enter inside HTML comment exits after the comment (BH-097)", () => {
  assert.equal(apply("<!--|comment -->", continueList), "<!--comment -->\n|");
  assert.equal(apply("<!-- comment| -->", continueList), "<!-- comment -->\n|");
  assert.equal(apply("<!--|x-->", continueList), "<!--x-->\n|");
  assert.equal(
    apply("text <!--|x--> more", continueList),
    "text <!--x-->\n| more",
  );
  assert.equal(
    apply("> <!--|comment -->", continueList),
    "> <!--comment -->\n|",
  );
});

test("Shift+Enter inside HTML comment exits after the comment (BH-097)", () => {
  assert.equal(apply("<!--|comment -->", continueLine), "<!--comment -->\n|");
  assert.equal(apply("<!-- comment| -->", continueLine), "<!-- comment -->\n|");
  assert.equal(
    apply("text <!--|x--> more", continueLine),
    "text <!--x-->\n| more",
  );
  assert.equal(
    apply("> <!--|comment -->", continueLine),
    "> <!--comment -->\n> |",
  );
  // Edge: caret at end still soft-breaks after (not claimed).
  assert.equal(apply("<!-- comment -->|", continueLine), "<!-- comment -->\n|");
});

test("Enter mid-ATX opener exits below without splitting marker (BH-098)", () => {
  assert.equal(apply("#| Title", continueList), "# Title\n|");
  assert.equal(apply("##| Hello", continueList), "## Hello\n|");
  assert.equal(apply("> #| Title", continueList), "> # Title\n> |");
  assert.equal(apply("- #| Title", continueList), "- # Title\n- |");
  assert.equal(apply("> - #| Title", continueList), "> - # Title\n> - |");
});

test("Shift+Enter mid-ATX opener exits below without splitting marker (BH-098)", () => {
  assert.equal(apply("#| Title", continueLine), "# Title\n|");
  assert.equal(apply("##| Hello world", continueLine), "## Hello world\n|");
  assert.equal(apply("> #| Title", continueLine), "> # Title\n> |");
  assert.equal(apply("- #| Title", continueLine), "- # Title\n  |");
});
