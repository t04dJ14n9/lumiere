import test from "node:test";
import assert from "node:assert/strict";
import type { EditorView } from "@codemirror/view";
import {
  observeNavigation,
  runNavigation,
  isCurrentReveal,
} from "./navigation";

test("only explicit successful jumps record and nested navigation records once", () => {
  const view = {} as EditorView;
  let captures = 0;
  let completed = 0;
  const stop = observeNavigation(view, () => {
    captures++;
    return () => {
      completed++;
    };
  });
  runNavigation(view, () => runNavigation(view, () => true));
  assert.equal(captures, 1);
  assert.equal(completed, 1);
  runNavigation(view, () => false);
  assert.equal(completed, 1);
  assert.throws(() =>
    runNavigation(view, () => {
      throw new Error("missing");
    }),
  );
  assert.equal(completed, 1);
  stop();
  runNavigation(view, () => true);
  assert.equal(completed, 1);
});

test("versioned source reveals reject both changed revisions and pending local edits", () => {
  assert.equal(isCurrentReveal(4, 4, false), true);
  assert.equal(isCurrentReveal(4, 4, true), false);
  assert.equal(isCurrentReveal(4, 5, false), false);
  assert.equal(isCurrentReveal(undefined, 5, false), true);
});
