import assert from "node:assert/strict";
import test from "node:test";
import {
  EditorSelection,
  EditorState,
  type TransactionSpec,
} from "@codemirror/state";
import {
  restoreCaret,
  selectionFitsDoc,
  snapshotCaret,
  type CaretSnapshot,
} from "./preserve-caret";
import type { EditorView } from "@codemirror/view";

test("selectionFitsDoc accepts in-range carets and rejects overflow", () => {
  const doc = { length: 10 };
  assert.equal(selectionFitsDoc(EditorSelection.single(0), doc), true);
  assert.equal(selectionFitsDoc(EditorSelection.single(10), doc), true);
  assert.equal(selectionFitsDoc(EditorSelection.single(2, 8), doc), true);
  assert.equal(selectionFitsDoc(EditorSelection.single(11), doc), false);
  assert.equal(selectionFitsDoc(EditorSelection.single(0, 11), doc), false);
});

function mockView(doc: string, head: number) {
  let state = EditorState.create({
    doc,
    selection: EditorSelection.single(head),
  });
  const scroll = { scrollTop: 0, scrollLeft: 0 };
  const view = {
    get state() {
      return state;
    },
    scrollDOM: scroll,
    dispatch(spec: TransactionSpec) {
      state = state.update(spec).state;
    },
  } as unknown as EditorView;
  return { view, scroll, getHead: () => state.selection.main.head };
}

test("restoreCaret reapplies a snapshot and skips changed documents", () => {
  const { view, getHead } = mockView("hello world", 2);
  const snap = snapshotCaret(view);
  view.dispatch({ selection: EditorSelection.single(8) });
  assert.equal(getHead(), 8);
  assert.equal(restoreCaret(view, snap), true);
  assert.equal(getHead(), 2);

  const stale: CaretSnapshot = {
    ...snap,
    doc: EditorState.create({ doc: "bye" }).doc,
  };
  view.dispatch({ selection: EditorSelection.single(4) });
  assert.equal(restoreCaret(view, stale), false);
  assert.equal(getHead(), 4);
});

test("restoreCaret rejects an intervening same-length replacement", () => {
  const { view, scroll, getHead } = mockView("hello world", 2);
  const snapshot = snapshotCaret(view);
  view.dispatch({
    changes: { from: 0, to: 5, insert: "HELLO" },
    selection: EditorSelection.single(8),
  });
  scroll.scrollTop = 40;
  assert.equal(restoreCaret(view, snapshot), false);
  assert.equal(getHead(), 8);
  assert.equal(scroll.scrollTop, 40);
});
