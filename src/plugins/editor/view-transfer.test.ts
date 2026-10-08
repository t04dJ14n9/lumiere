import test from "node:test";
import assert from "node:assert/strict";
import type { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { foldState, foldEffect, foldedRanges } from "@codemirror/language";
import { fakeDocument } from "../../../test/support/vscode-fake";
import type { EditorPanel } from "./api";
import { captureView, restoreView } from "./view-transfer";
import { createViewState } from "./view-state";
import { viewState } from "./protocol";

const saved = viewState.parse({
  source: "old.md",
  anchor: 4,
  head: 8,
  scrollTop: 25,
  scrollLeft: 3,
  mode: "source",
  folds: { "old.md|callout": false },
});

test("view capture flushes before reading version and rejects concurrent changes", async () => {
  const document = fakeDocument();
  const order: string[] = [];
  const panel = {
    id: "first",
    document,
    session: {
      async flush() {
        order.push("flush");
      },
    },
    rpc: {
      async call() {
        order.push("capture");
        return saved;
      },
    },
  } as unknown as EditorPanel;
  const snapshot = await captureView(panel);
  assert.equal(snapshot.editorId, "first");
  assert.deepEqual(order, ["flush", "capture"]);
  const moved = {
    ...panel,
    rpc: {
      async call() {
        document.version++;
        return saved;
      },
    },
  } as unknown as EditorPanel;
  await assert.rejects(captureView(moved), /changed/);
});

test("two panels keep independent transfer state and rename retains old disclosure identity", async () => {
  const restored: unknown[] = [];
  const document = fakeDocument();
  const panel = {
    id: "first",
    document,
    session: { async flush() {} },
    rpc: {
      async call() {
        return saved;
      },
    },
  } as unknown as EditorPanel;
  const second = {
    ...panel,
    id: "second",
    rpc: {
      async call() {
        return { ...saved, head: 1 };
      },
    },
  } as unknown as EditorPanel;
  const firstState = await captureView(panel);
  const secondState = await captureView(second);
  assert.notEqual(firstState.editorId, secondState.editorId);
  assert.equal(firstState.state.head, 8);
  assert.equal(secondState.state.head, 1);
  const target = {
    rpc: {
      async call(_protocol: unknown, _method: string, state: unknown) {
        restored.push(state);
        return true;
      },
    },
  } as unknown as EditorPanel;
  await restoreView(target, firstState);
  assert.deepEqual(restored, [saved]);
});

test("restore clamps selection, replaces folds, and restores raw scroll without centering", () => {
  let state = EditorState.create({
    doc: "one\ntwo\nthree",
    extensions: [foldState],
  });
  state = state.update({ effects: foldEffect.of({ from: 0, to: 3 }) }).state;
  const view = {
    get state() {
      return state;
    },
    scrollDOM: { scrollTop: 0, scrollLeft: 0 },
    dispatch(spec: Parameters<EditorState["update"]>[0]) {
      state = state.update(spec).state;
    },
  } as unknown as EditorView;
  createViewState().restoreViewState(view, {
    ...saved,
    anchor: 100,
    head: 90,
    folded: [
      { from: 4, to: 7 },
      { from: 9, to: 100 },
    ],
  });
  assert.equal(state.selection.main.head, state.doc.length);
  const folds: number[][] = [];
  foldedRanges(state).between(0, state.doc.length, (from, to) => {
    folds.push([from, to]);
  });
  assert.deepEqual(folds, [[4, 7]]);
  assert.equal(view.scrollDOM.scrollTop, 25);
  assert.equal(view.scrollDOM.scrollLeft, 3);
});
