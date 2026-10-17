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
