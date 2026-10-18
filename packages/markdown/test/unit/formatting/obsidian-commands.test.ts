import test from "node:test";
import assert from "node:assert/strict";
import { EditorState, type TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { markdownLanguageSupport } from "../../../src/markdown/dialect";
import { wrapSelection } from "../../../src/plugins/formatting/inline";
import { lineEdit, ruleEdit } from "../../../src/plugins/formatting/lines";
import { checklistEdit } from "../../../src/plugins/tasks/edits";
import { insertTable } from "../../../src/plugins/tables/commands";

// Every expected note is Obsidian's, measured by running its command on the
// same note and selection in a throwaway vault (2026-10-17). "|" is the caret;
// "‹" and "›" the selection's start and end.

function parse(doc: string): EditorState {
  let text = "";
  let anchor = 0;
  let head = 0;
  for (const char of doc) {
    if (char === "|") {
      anchor = head = text.length;
    } else if (char === "‹") {
      anchor = text.length;
    } else if (char === "›") {
      head = text.length;
    } else {
      text += char;
    }
  }
  return EditorState.create({
    doc: text,
    selection: { anchor, head },
    extensions: [markdownLanguageSupport()],
  });
}

function show(state: EditorState): string {
  const text = state.doc.toString();
  const { from, to } = state.selection.main;
  return from === to
    ? `${text.slice(0, from)}|${text.slice(from)}`
    : `${text.slice(0, from)}‹${text.slice(from, to)}›${text.slice(to)}`;
}

const edit = (doc: string, make: (state: EditorState) => TransactionSpec) => {
  const state = parse(doc);
  return show(state.update(make(state)).state);
};

const wrap = (doc: string, marker: string) => {
  let state = parse(doc);
  const view = {
    get state() {
      return state;
    },
    dispatch(spec: TransactionSpec) {
      state = state.update(spec).state;
    },
  } as unknown as EditorView;
  wrapSelection(marker)(view);
  return show(state);
};

test("bold and the other markers wrap each selected line on its own, and unwrap them", () => {
  assert.equal(wrap("‹one\ntwo›", "**"), "**‹one**\n**two›**");
  assert.equal(wrap("‹**one**\n**two**›", "**"), "‹one\ntwo›");
  assert.equal(wrap("**‹one**\n**two›**", "**"), "‹one\ntwo›");
  assert.equal(wrap("‹one\n\ntwo›", "**"), "**‹one**\n\n**two›**");
  assert.equal(wrap("o‹ne\ntw›o", "`"), "o`‹ne`\n`tw›`o");
  assert.equal(wrap("‹**one**\n**two**›", "`"), "`‹**one**`\n`**two**›`");
});

test("inline math wraps the word at the caret, as bold does", () => {
  assert.equal(wrap("te|xt", "$"), "$te|xt$");
  assert.equal(wrap("a |b", "$"), "a $|b$");
  assert.equal(wrap("|", "$"), "$|$");
  assert.equal(wrap("‹one\ntwo›", "$"), "$‹one$\n$two›$");
});

test("headings, lists and quotes leave a caret on an empty line after their marker", () => {
  assert.equal(
    edit("|", (s) => lineEdit(s, "- ")),
    "- |",
  );
  assert.equal(
    edit("|", (s) => lineEdit(s, "1. ")),
    "1. |",
  );
  assert.equal(
    edit("|", (s) => lineEdit(s, "> ")),
    "> |",
  );
  assert.equal(
    edit("|", (s) => lineEdit(s, "# ")),
    "# |",
  );
  assert.equal(
    edit("|", (s) => lineEdit(s, "### ")),
    "### |",
  );
});

test("a list marker replaces another list's, checkbox and all, and a second press removes it", () => {
  assert.equal(
    edit("- it|em", (s) => lineEdit(s, "1. ")),
    "1. it|em",
  );
  assert.equal(
    edit("1. it|em", (s) => lineEdit(s, "1. ")),
    "it|em",
  );
  assert.equal(
    edit("1. it|em", (s) => lineEdit(s, "- ")),
    "- it|em",
  );
  assert.equal(
    edit("- it|em", (s) => lineEdit(s, "- ")),
    "it|em",
  );
  assert.equal(
    edit("- [ ] it|em", (s) => lineEdit(s, "- ")),
    "- it|em",
  );
  assert.equal(
    edit("- [ ] it|em", (s) => lineEdit(s, "1. ")),
    "1. it|em",
  );
  assert.equal(
    edit("‹one\ntwo›\nthree", (s) => lineEdit(s, "- ")),
    "- ‹one\n- two›\nthree",
  );
});

test("a horizontal rule goes on a line of its own, the caret on the line after", () => {
  assert.equal(edit("|", ruleEdit), "\n---\n|");
  assert.equal(edit("above\n|\nbelow", ruleEdit), "above\n\n---\n|\nbelow");
  assert.equal(edit("te|xt", ruleEdit), "te\n\n---\n|xt");
  assert.equal(
    edit("above\n‹one\ntwo›\nbelow", ruleEdit),
    "above\n\n---\n|\nbelow",
  );
});

test("cycling a line goes text, bullet, [ ], [x], bullet", () => {
  let doc = "te|xt";
  const seen: string[] = [];
  for (let i = 0; i < 4; i++) {
    doc = edit(doc, (s) => checklistEdit(s, true));
    seen.push(doc);
  }
  assert.deepEqual(seen, ["- te|xt", "- [ ] te|xt", "- [x] te|xt", "- te|xt"]);
  assert.equal(
    edit("1. it|em", (s) => checklistEdit(s, true)),
    "1. [ ] it|em",
  );
  // Toggle checkbox status still makes plain text a task at once.
  assert.equal(
    edit("te|xt", (s) => checklistEdit(s, false)),
    "- [ ] te|xt",
  );
});

test("a new table goes after the line the selection starts on, the caret at its start", () => {
  const table = "|     |     |\n| --- | --- |\n|     |     |";
  assert.equal(edit("|", insertTable), `\n|${table}\n`);
  assert.equal(
    edit("above\n|\nbelow", insertTable),
    `above\n\n|${table}\n\nbelow`,
  );
  assert.equal(edit("te|xt\n", insertTable), `text\n\n|${table}\n\n`);
  assert.equal(
    edit("above\n‹one\ntwo›\nbelow", insertTable),
    `above\none\n\n|${table}\n\ntwo\nbelow`,
  );
});
