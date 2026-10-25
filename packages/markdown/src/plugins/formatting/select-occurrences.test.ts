import test from "node:test";
import assert from "node:assert/strict";
import { EditorState, type Transaction } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { selectAllOccurrences } from "./select-occurrences";

/** Minimal view: CM search commands only need `state` + `dispatch(tr)`. */
function viewWith(doc: string, anchor: number, head = anchor): EditorView {
  let state = EditorState.create({
    doc,
    selection: { anchor, head },
    extensions: EditorState.allowMultipleSelections.of(true),
  });
  return {
    get state() {
      return state;
    },
    dispatch(tr: Transaction) {
      state = tr.state;
    },
  } as unknown as EditorView;
}

test("empty caret Ctrl+Shift+L selects the word then every match (BH-038)", () => {
  const doc = "Heading one\nHeading two\nHeading three";
  const view = viewWith(doc, 2);
  assert.equal(view.state.selection.main.empty, true);
  assert.equal(selectAllOccurrences(view), true);
  const ranges = view.state.selection.ranges;
  assert.equal(ranges.length, 3);
  assert.deepEqual(
    ranges.map((r) => view.state.sliceDoc(r.from, r.to)),
    ["Heading", "Heading", "Heading"],
  );
});

test("non-empty selection still selects every match (BH-037)", () => {
  const doc = "Heading one\nHeading two";
  const view = viewWith(doc, 0, 7);
  assert.equal(selectAllOccurrences(view), true);
  assert.equal(view.state.selection.ranges.length, 2);
});
