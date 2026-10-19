import test from "node:test";
import assert from "node:assert/strict";
import { EditorState, type TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { documentTree } from "../../../src/plugins/livePreview/document-tree";
import { inlineDecorations } from "../../../src/plugins/livePreview/inline";
import { wrapSelection } from "../../../src/plugins/formatting/inline";
import { toggleHighlightColour } from "../../../src/plugins/formatting/highlight-colour";
import { highlightColourSuggestion } from "../../../src/plugins/formatting/highlight-suggest";
import { markdownLanguageSupport } from "../../../src/markdown/dialect";
import { localCompletions } from "../../../src/plugins/suggest/webview";

test("bold followed by red highlight inside a word hides all syntax when the caret leaves", () => {
  const doc = "A sentence with a footnote.[^1] Another.";
  let state = EditorState.create({
    doc,
    selection: { anchor: doc.indexOf("ence"), head: doc.indexOf("note.") },
    extensions: [documentTree],
  });
  const view = {
    get state() {
      return state;
    },
    dispatch(spec: TransactionSpec) {
      state = state.update(spec).state;
    },
  } as unknown as EditorView;
  wrapSelection("**")(view);
  toggleHighlightColour("red")(view);
  assert.equal(
    state.doc.toString(),
    "A sent**==🔴ence with a foot==**note.[^1] Another.",
  );
  state = state.update({
    selection: { anchor: state.doc.toString().indexOf("[^1]") + 4 },
  }).state;
  const hidden: string[] = [];
  const faint: string[] = [];
  inlineDecorations(state, [{ from: 0, to: state.doc.length }]).between(
    0,
    state.doc.length,
    (from, to, value) => {
      if (value.point && from < to) {
        hidden.push(state.sliceDoc(from, to));
      }
      if (value.spec.class === "md-syntax-mark") {
        faint.push(state.sliceDoc(from, to));
      }
    },
  );
  assert.deepEqual(hidden, ["**", "==", "🔴", "==", "**"]);
  assert.deepEqual(faint, []);
});

test("bold then typed == and Red wraps the word and hides every marker with the caret away", () => {
  const doc = "A hard line break ends this line\n\n# Heading 1";
  let state = EditorState.create({
    doc,
    selection: { anchor: doc.indexOf("hard") },
    extensions: [documentTree, markdownLanguageSupport()],
  });
  const view = {
    get state() {
      return state;
    },
    dispatch(spec: TransactionSpec) {
      state = state.update(spec).state;
    },
  } as unknown as EditorView;
  wrapSelection("**")(view);
  assert.equal(
    state.sliceDoc(0, state.doc.line(1).to),
    "A **hard** line break ends this line",
  );
  const opening = state.doc.toString().indexOf("hard");
  state = state.update({
    changes: { from: opening, insert: "==" },
    selection: { anchor: opening + 2 },
    userEvent: "input.type",
  }).state;
  const pos = state.selection.main.head;
  const list = highlightColourSuggestion({ state, pos });
  assert.ok(list);
  const red = localCompletions(list).options.find(
    (option) => option.label === "Red",
  );
  assert.ok(red);
  assert.equal(typeof red.apply, "function");
  if (typeof red.apply === "function") {
    red.apply(view, red, list.at, pos);
  }
  assert.equal(
    state.doc.toString(),
    "A **==🔴hard==** line break ends this line\n\n# Heading 1",
  );
  assert.equal(state.selection.main.head, state.doc.toString().indexOf("hard"));
  state = state.update({ selection: { anchor: state.doc.line(3).to } }).state;
  const hidden: string[] = [];
  const styled: { text: string; className: string }[] = [];
  const faint: string[] = [];
  inlineDecorations(state, [{ from: 0, to: state.doc.length }]).between(
    0,
    state.doc.line(1).to,
    (from, to, value) => {
      if (value.point && from < to) {
        hidden.push(state.sliceDoc(from, to));
      }
      if (value.spec.class === "md-syntax-mark") {
        faint.push(state.sliceDoc(from, to));
      }
      if (value.spec.class) {
        styled.push({
          text: state.sliceDoc(from, to),
          className: value.spec.class,
        });
      }
    },
  );
  assert.deepEqual(hidden, ["**", "==", "🔴", "==", "**"]);
  assert.deepEqual(faint, []);
  assert.ok(
    styled.some(
      ({ text, className }) =>
        text.includes("hard") && className === "md-strong",
    ),
  );
  assert.ok(
    styled.some(
      ({ text, className }) =>
        text.includes("hard") &&
        className.split(" ").includes("md-highlight-red"),
    ),
  );
});
