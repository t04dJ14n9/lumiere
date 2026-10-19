import assert from "node:assert/strict";
import test from "node:test";
import { EditorSelection, EditorState } from "@codemirror/state";
import type { TransactionSpec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { createRoot } from "@workshop/core";
import { createViewState } from "./view-state";
import { viewState } from "./protocol";

type ScrollMeasurement = NonNullable<
  Parameters<EditorView["requestMeasure"]>[0]
>;

function restoredPanel(presentation: ReturnType<typeof createViewState>) {
  let state = EditorState.create({
    doc: "note",
    extensions: presentation.restoreScrollPosition,
  });
  const geometry = { top: 720 };
  const scrollDOM = {
    scrollTop: 600,
    scrollLeft: 0,
    getBoundingClientRect: () => ({ top: 0 }),
  };
  const measures: ScrollMeasurement[] = [];
  const view = {
    get state() {
      return state;
    },
    get documentTop() {
      return -scrollDOM.scrollTop;
    },
    scaleY: 1,
    scrollDOM,
    lineBlockAt: () => geometry,
    requestMeasure(request: ScrollMeasurement) {
      measures.push(request);
    },
    dispatch(spec: TransactionSpec) {
      state = state.update(spec).state;
    },
  } as unknown as EditorView;
  presentation.restoreViewState(
    view,
    viewState.parse({
      anchor: 0,
      head: 0,
      scrollTop: 600,
      scrollAnchor: { from: 0, offset: 0 },
      mode: "livePreview",
    }),
  );
  const handler = state.facet(EditorView.scrollHandler)[0]!;
  assert.equal(
    handler(view, EditorSelection.cursor(0), {
      x: "nearest",
      y: "start",
      xMargin: 0,
      yMargin: 0,
    }),
    true,
  );
  return {
    view,
    geometry,
    scrollDOM,
    flushMeasurements() {
      for (const request of measures) {
        request.write?.(request.read(view), view);
      }
    },
  };
}

test("widget scroll input cancels applied restore and queued layout correction only in its panel", async () => {
  const root = createRoot();
  const presentation = createViewState(root);
  const first = restoredPanel(presentation);
  const second = restoredPanel(presentation);
  const firstTop = first.scrollDOM.scrollTop;
  const secondTop = second.scrollDOM.scrollTop;
  root.emit("editor/scrollInput", first.view);
  first.geometry.top += 60;
  second.geometry.top += 60;
  first.flushMeasurements();
  second.flushMeasurements();
  assert.equal(first.scrollDOM.scrollTop, firstTop);
  assert.equal(second.scrollDOM.scrollTop, secondTop + 60);
  await root.dispose();
});

/** A panel scrolled to 600 px, its top line (at 40) starting 10 px above. */
function scrolledPanel(presentation: ReturnType<typeof createViewState>) {
  let state = EditorState.create({
    doc: "x".repeat(100),
    extensions: presentation.restoreScrollPosition,
  });
  const line = { from: 40, top: 590 };
  const scrollDOM = {
    scrollTop: 600,
    scrollLeft: 0,
    getBoundingClientRect: () => ({ top: 0 }),
  };
  const dispatched: TransactionSpec[] = [];
  const view = {
    get state() {
      return state;
    },
    get documentTop() {
      return -scrollDOM.scrollTop;
    },
    scaleY: 1,
    scrollDOM,
    lineBlockAt: () => line,
    lineBlockAtHeight: () => line,
    requestMeasure() {},
    dispatch(spec: TransactionSpec) {
      dispatched.push(spec);
      state = state.update(spec).state;
    },
  } as unknown as EditorView;
  const scroll = (head: number) =>
    state.facet(EditorView.scrollHandler)[0]!(
      view,
      EditorSelection.cursor(head),
      { x: "nearest", y: "start", xMargin: 0, yMargin: 0 },
    );
  return { view, line, scrollDOM, dispatched, scroll };
}

test("turning a plugin on or off keeps the line at the top of the viewport in place", async () => {
  const root = createRoot();
  const presentation = createViewState(root);
  const panel = scrolledPanel(presentation);
  let changed = false;
  presentation.keepPlace(panel.view, () => {
    changed = true;
    // Reconfiguring re-estimated the heights above: the line moved up 140 px.
    panel.line.top = 450;
  });
  assert.equal(changed, true);
  assert.equal(panel.dispatched.length, 1);
  assert.equal(panel.scroll(40), true);
  assert.equal(panel.line.top - panel.scrollDOM.scrollTop, -10);

  // Turned back on while layout settles: the same line stays pinned.
  presentation.keepPlace(panel.view, () => (panel.line.top = 520));
  assert.equal(panel.dispatched.length, 2);
  assert.equal(panel.scroll(40), true);
  assert.equal(panel.line.top - panel.scrollDOM.scrollTop, -10);
  await root.dispose();
});

test("keeping the place leaves a view at the top, and a restore on its way, alone", async () => {
  const root = createRoot();
  const presentation = createViewState(root);
  const top = scrolledPanel(presentation);
  top.scrollDOM.scrollTop = 0;
  presentation.keepPlace(top.view, () => {});
  assert.equal(top.dispatched.length, 0);

  const restoring = scrolledPanel(presentation);
  presentation.restoreViewState(
    restoring.view,
    viewState.parse({
      anchor: 0,
      head: 0,
      scrollTop: 0,
      scrollAnchor: { from: 70, offset: 0 },
      mode: "livePreview",
    }),
  );
  let changed = false;
  presentation.keepPlace(restoring.view, () => (changed = true));
  assert.equal(changed, true);
  assert.equal(restoring.dispatched.length, 1, "only the restore's dispatch");
  // The restore still lands where it was going.
  assert.equal(restoring.scroll(70), true);
  await root.dispose();
});
