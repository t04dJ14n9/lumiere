import test from "node:test";
import assert from "node:assert/strict";
import { EditorState, type TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { documentTree } from "../../../src/plugins/livePreview/document-tree";
import { inlineDecorations } from "../../../src/plugins/livePreview/inline";
import { wrapSelection } from "../../../src/plugins/formatting/inline";
import { toggleHighlightColour } from "../../../src/plugins/formatting/highlight-colour";

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
