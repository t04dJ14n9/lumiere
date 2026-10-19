import test from "node:test";
import assert from "node:assert/strict";
import { EditorSelection, EditorState } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import {
  pointerSelection,
  revealFreezeToggled,
  revealRanges,
  setVisualRevealFreeze,
  visualRevealFreeze,
} from "../../../src/webview/ui/pointer-selection";

function stateWith(doc: string, selection: EditorSelection): EditorState {
  const extensions: Extension[] = [pointerSelection, visualRevealFreeze];
  return EditorState.create({ doc, selection, extensions });
}

test("revealRanges prefers a Vim visual freeze over the live selection", () => {
  const doc = "aaa\n\n```\ncode\n```\n\nbbb";
  const live = EditorSelection.single(0, doc.length);
  const frozen = EditorSelection.single(0);
  let state = stateWith(doc, live);
  state = state.update({
    effects: setVisualRevealFreeze.of(frozen),
  }).state;
  const ranges = revealRanges(state);
  assert.equal(ranges.length, 1);
  assert.equal(ranges[0]!.from, 0);
  assert.equal(ranges[0]!.to, 0);
  assert.equal(state.selection.main.to, doc.length);
});

test("thawing the visual freeze restores live selection reveals", () => {
  const doc = "before\n```\ncode\n```\nafter";
  const blockFrom = doc.indexOf("```");
  const blockTo = doc.lastIndexOf("```") + 3;
  let state = stateWith(doc, EditorSelection.single(blockFrom, blockTo));
  state = state.update({
    effects: setVisualRevealFreeze.of(EditorSelection.single(0)),
  }).state;
  assert.equal(revealRanges(state)[0]!.to, 0);
  const thawed = state.update({
    effects: setVisualRevealFreeze.of(null),
  });
  assert.equal(revealFreezeToggled(state, thawed.state), true);
  const ranges = revealRanges(thawed.state);
  assert.equal(ranges[0]!.from, blockFrom);
  assert.equal(ranges[0]!.to, blockTo);
});

test("a whole-line reveal range still excludes the next line start", () => {
  const doc = "one\ntwo\nthree";
  const line1 = EditorSelection.single(0, 4);
  const frozen = stateWith(doc, line1).update({
    effects: setVisualRevealFreeze.of(line1),
  }).state;
  const range = revealRanges(frozen)[0]!;
  assert.equal(range.from, 0);
  assert.equal(range.to, 3);
});
