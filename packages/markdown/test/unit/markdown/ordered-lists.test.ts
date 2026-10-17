import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import {
  orderedRun,
  renumberAround,
} from "../../../src/markdown/ordered-lists";

const doc = (text: string) => EditorState.create({ doc: text }).doc;

test("a run is one list level: deeper and blank lines inside, others end it", () => {
  const text = doc("1. a\n\t- x\n\n2. b\npara\n3. c");
  assert.deepEqual(
    orderedRun(text, 1, 4).map((item) => item.line),
    [1, 4],
  );
  assert.deepEqual(orderedRun(text, 2, 4), []);
  assert.deepEqual(
    orderedRun(doc("1. a\n1) b"), 1, 4).map((item) => item.line),
    [1],
  );
});

test("runs around moved lines count on, from 1 where a moved item leads", () => {
  const renumbered = (text: string, first: number, last = first) => {
    const state = EditorState.create({ doc: text });
    return state
      .update({ changes: renumberAround(state.doc, { first, last }, 4) })
      .newDoc.toString();
  };
  assert.equal(renumbered("1. a\n\t2. b\n3. c", 2), "1. a\n\t1. b\n2. c");
  assert.equal(renumbered("1. a\n1. b\n2. c", 2), "1. a\n2. b\n3. c");
  assert.equal(renumbered("5. a\n7. b", 2), "5. a\n6. b");
  assert.equal(renumbered("- a\n- b", 2), "- a\n- b");
});
