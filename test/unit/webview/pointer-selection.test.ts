import test from "node:test";
import assert from "node:assert/strict";
import { EditorSelection, EditorState } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import {
  isPointerSelecting,
  pointerSelection,
  pointerSelectionToggled,
  revealRanges,
  setPointerSelection,
} from "../../../src/webview/ui/pointer-selection";

function stateWith(doc: string, selection: EditorSelection): EditorState {
  const extensions: Extension[] = [pointerSelection];
  return EditorState.create({ doc, selection, extensions });
}

test("revealRanges prefers the pointer freeze over the live selection", () => {
  const doc = "aaa\n\n```mermaid\ngraph TD\nA-->B\n```\n\nbbb";
  const live = EditorSelection.single(0, doc.length);
  const frozen = EditorSelection.single(0);
  let state = stateWith(doc, live);
  state = state.update({ effects: setPointerSelection(frozen) }).state;
  assert.equal(isPointerSelecting(state), true);
  const ranges = revealRanges(state);
  assert.equal(ranges.length, 1);
  assert.equal(ranges[0]!.from, 0);
  assert.equal(ranges[0]!.to, 0);
  assert.equal(state.selection.main.to, doc.length);
});

test("thawing the pointer freeze restores live selection reveals", () => {
  const doc = "before\n```mermaid\ngraph TD\nA-->B\n```\nafter";
  const blockFrom = doc.indexOf("```");
  const blockTo = doc.lastIndexOf("```") + 3;
  let state = stateWith(doc, EditorSelection.single(blockFrom, blockTo));
  state = state.update({
    effects: setPointerSelection(EditorSelection.single(0)),
  }).state;
  assert.equal(revealRanges(state)[0]!.to, 0);
  const thawed = state.update({ effects: setPointerSelection(null) });
  assert.equal(pointerSelectionToggled(state, thawed.state), true);
  assert.equal(isPointerSelecting(thawed.state), false);
  const ranges = revealRanges(thawed.state);
  assert.equal(ranges[0]!.from, blockFrom);
  assert.equal(ranges[0]!.to, blockTo);
});

test("growing a live selection while frozen does not change reveal ranges", () => {
  const doc = "line1\nline2\n```\ntall\n```\nline3";
  const start = EditorSelection.single(0);
  let state = stateWith(doc, start);
  state = state.update({ effects: setPointerSelection(start) }).state;
  const before = revealRanges(state).map((range) => ({
    from: range.from,
    to: range.to,
  }));
  state = state.update({
    selection: EditorSelection.single(0, doc.length),
  }).state;
  assert.equal(isPointerSelecting(state), true);
  const after = revealRanges(state).map((range) => ({
    from: range.from,
    to: range.to,
  }));
  assert.deepEqual(after, before);
});
