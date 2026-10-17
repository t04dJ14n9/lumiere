import assert from "node:assert/strict";
import test from "node:test";
import { EditorSelection, EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { withPreservedCaret } from "./preserve-caret";

test("withPreservedCaret restores selection after a synchronous jump", () => {
  let state = EditorState.create({
    doc: "one\ntwo\nthree",
    selection: EditorSelection.single(5),
  });
  const scroll = { scrollTop: 12, scrollLeft: 0 };
  const view = {
    get state() {
      return state;
    },
    scrollDOM: scroll,
    dom: { isConnected: true },
    dispatch(spec: { selection?: EditorSelection; scrollIntoView?: boolean }) {
      state = state.update(spec).state;
    },
    requestMeasure() {},
  } as unknown as EditorView;

  withPreservedCaret(view, () => {
    view.dispatch({ selection: EditorSelection.single(0) });
  });
  assert.equal(state.selection.main.head, 5);
  assert.equal(scroll.scrollTop, 12);
});
