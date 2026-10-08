import test from "node:test";
import assert from "node:assert/strict";
import { EditorSelection, EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { markdownLanguageSupport } from "../../markdown/dialect";
import { clearInlineFormatting, wrapSelection } from "./inline";
import { lineEdit, linkEdit } from "./lines";

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

test("insert link selects the URL while keeping the selected label", () => {
  const state = EditorState.create({
    doc: "label",
    selection: { anchor: 0, head: 5 },
  });
  const next = state.update(linkEdit(state)).state;
  assert.equal(next.doc.toString(), "[label](url)");
  assert.equal(
    next.sliceDoc(next.selection.main.from, next.selection.main.to),
    "url",
  );
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
