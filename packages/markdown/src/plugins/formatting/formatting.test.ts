import test from "node:test";
import assert from "node:assert/strict";
import { EditorSelection, EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { markdownLanguageSupport } from "../../markdown/dialect";
import { clearInlineFormatting, wrapSelection } from "./inline";
import { lineEdit, linkEdit } from "./lines";
import { toggleComment } from "./comment";

test("formatting toggles exact markers while retaining selection and obeying read-only", () => {
  let state = EditorState.create({
    doc: "hello",
    selection: { anchor: 0, head: 5 },
    extensions: [markdownLanguageSupport()],
  });
  const view = {
    get state() {
      return state;
    },
    dispatch(spec: Parameters<EditorState["update"]>[0]) {
      state = state.update(spec).state;
    },
  } as EditorView;
  assert.equal(wrapSelection("**")(view), true);
  assert.equal(state.doc.toString(), "**hello**");
  assert.equal(
    state.sliceDoc(state.selection.main.from, state.selection.main.to),
    "hello",
  );
  wrapSelection("**")(view);
  assert.equal(state.doc.toString(), "hello");
  state = EditorState.create({
    doc: "hello",
    extensions: [EditorState.readOnly.of(true)],
  });
  assert.equal(wrapSelection("**")(view), false);
  assert.equal(state.doc.toString(), "hello");
});

test("line commands exclude a final column-zero line and numbered lists toggle as a group", () => {
  let state = EditorState.create({
    doc: "alpha\nbeta\ngamma",
    selection: { anchor: 0, head: 11 },
  });
  state = state.update(lineEdit(state, "1. ")).state;
  assert.equal(state.doc.toString(), "1. alpha\n2. beta\ngamma");
  state = state.update(lineEdit(state, "1. ")).state;
  assert.equal(state.doc.toString(), "alpha\nbeta\ngamma");
  state = state.update(lineEdit(state, "## ")).state;
  assert.equal(state.doc.toString(), "## alpha\n## beta\ngamma");
  state = state.update(lineEdit(state, "")).state;
  assert.equal(state.doc.toString(), "alpha\nbeta\ngamma");
});

test("insert link puts the caret in the URL after a label, else in the label", () => {
  const link = (doc: string, anchor: number, head: number) => {
    const state = EditorState.create({ doc, selection: { anchor, head } });
    const next = state.update(linkEdit(state)).state;
    const at = next.selection.main.head;
    return next.sliceDoc(0, at) + "|" + next.sliceDoc(at);
  };
  assert.equal(link("hello world", 6, 11), "hello [world](|)");
  assert.equal(link("hello ", 6, 6), "hello [|]()");
  assert.equal(link("hello world", 8, 8), "hello wo[|]()rld");
});

test("toggle comment wraps the selection or the word in %% … %%, as in Obsidian", () => {
  const comment = (doc: string) => {
    const anchor = doc.includes("‹") ? doc.indexOf("‹") : doc.indexOf("|");
    const head = doc.includes("›") ? doc.indexOf("›") - 1 : anchor;
    const state = EditorState.create({
      doc: doc.replace(/[|‹›]/gu, ""),
      selection: { anchor, head },
      extensions: [markdownLanguageSupport()],
    });
    const next = state.update(toggleComment(state)).state;
    const { from, to } = next.selection.main;
    const out = next.doc.toString();
    return from === to
      ? out.slice(0, from) + "|" + out.slice(from)
      : out.slice(0, from) + "‹" + out.slice(from, to) + "›" + out.slice(to);
  };
  assert.equal(comment("hello wo|rld"), "hello %% ‹world› %%");
  assert.equal(comment("hello |world"), "hello %% ‹world› %%");
  assert.equal(comment("hello ‹world›"), "hello %% ‹world› %%");
  assert.equal(comment("hello |"), "hello %% | %%");
  assert.equal(comment("|"), "%% | %%");
  assert.equal(comment("‹a\nb›"), "%% ‹a\nb› %%");
  // Inside a comment, the markers go (with the spaces inside them).
  assert.equal(comment("hello %% wo|rld %%"), "hello wo|rld");
  assert.equal(comment("a %%wo|rd%% b"), "a wo|rd b");
});

test("clearing inline formatting retains comment contents, links and escaped literals", () => {
  assert.equal(
    clearInlineFormatting(
      "**Bold** *soft* ~~old~~ ==marked== %%kept%% `code` $x$ [Link](target) \\*literal\\*",
    ),
    "Bold soft old marked kept code x [Link](target) \\*literal\\*",
  );
});

test("caret formatting unwraps enclosing syntax and wraps a plain word", () => {
  for (const [doc, position, expected, caret] of [
    ["**hello**", 4, "hello", 2],
    ["hello", 2, "**hello**", 4],
    [" ", 0, "**** ", 2],
  ] as const) {
    let state = EditorState.create({
      doc,
      selection: { anchor: position },
      extensions: [markdownLanguageSupport()],
    });
    const view = {
      get state() {
        return state;
      },
      dispatch(spec: Parameters<EditorState["update"]>[0]) {
        state = state.update(spec).state;
      },
    } as EditorView;
    wrapSelection("**")(view);
    assert.equal(state.doc.toString(), expected);
    assert.equal(state.selection.main.head, caret);
  }
});

test("formatting handles selected delimiters and independent multiple ranges", () => {
  let state = EditorState.create({
    doc: "**one** two",
    extensions: [
      EditorState.allowMultipleSelections.of(true),
      markdownLanguageSupport(),
    ],
    selection: EditorSelection.create([
      EditorSelection.range(0, 7),
      EditorSelection.range(8, 11),
    ]),
  });
  const view = {
    get state() {
      return state;
    },
    dispatch(spec: Parameters<EditorState["update"]>[0]) {
      state = state.update(spec).state;
    },
  } as EditorView;
  wrapSelection("**")(view);
  assert.equal(state.doc.toString(), "one **two**");
  assert.deepEqual(
    state.selection.ranges.map((range) => state.sliceDoc(range.from, range.to)),
    ["one", "two"],
  );
});
