import assert from "node:assert/strict";
import test from "node:test";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { createViewState } from "../../../src/plugins/editor/view-state";
import { viewState } from "../../../src/plugins/editor/protocol";
import { blockRenderers } from "../../../src/plugins/livePreview/registry";
import { tablesWebview } from "../../../src/plugins/tables/webview";
import { TableWidget } from "../../../src/plugins/tables/widget";
import { forwardTableWheel } from "../../../src/plugins/tables/wheel-scroll";
import { fixture } from "./fixture";

function wheel(overrides: Partial<WheelEvent> = {}) {
  return Object.assign(new Event("wheel", { cancelable: true }), {
    deltaX: 0,
    deltaY: 120,
    deltaMode: 0,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...overrides,
  });
}

test("table wheel cancels restore only for vertical input and preserves boundary chaining", async (t) => {
  const { root, view } = fixture();
  t.after(() => root.dispose());
  const presentation = createViewState(root);
  const scrolls: ScrollToOptions[] = [];
  const viewport = Object.assign(view.scrollDOM, {
    scrollTop: 600,
    scrollHeight: 2000,
    clientHeight: 500,
    scrollTo(options: ScrollToOptions) {
      scrolls.push(options);
      // Instant scroll applies synchronously in the browser.
      if (options.behavior === "instant" && options.top !== undefined) {
        this.scrollTop = options.top;
      }
    },
    getBoundingClientRect: () => ({ top: 0 }),
  });
  const dom = Object.assign(view.dom, {
    ownerDocument: {
      defaultView: { matchMedia: () => ({ matches: false }) },
    },
  });
  Object.assign(view, {
    documentTop: 0,
    scaleY: 1,
    lineBlockAt: () => ({ top: 0 }),
    requestMeasure() {},
  });
  const fiber = root.plugin(tablesWebview);
  await root.settled();
  assert.equal(fiber.state, "active");
  const renderer = view.state
    .facet(blockRenderers)
    .find((item) => item.kind === "Table");
  assert.ok(renderer);
  const source = "| A | B |\n| --- | --- |\n| C | D |";
  const widget = renderer.widget({
    kind: "Table",
    source,
    from: 0,
    to: source.length,
  });
  assert.ok(widget instanceof TableWidget);
  const scrollNote = widget.environment.scrollNote;
  const restoreScroll = EditorState.create({
    extensions: presentation.restoreScrollPosition,
  }).facet(EditorView.scrollHandler)[0]!;
  const restore = () =>
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
  const applyRestore = () =>
    restoreScroll(view, EditorSelection.cursor(0), {
      x: "nearest",
      y: "start",
      xMargin: 0,
      yMargin: 0,
    });
  for (const input of [
    { deltaX: 120, deltaY: 0 },
    { shiftKey: true },
    { ctrlKey: true },
    { metaKey: true },
    { deltaY: 0 },
  ]) {
    restore();
    const event = wheel(input);
    forwardTableWheel(event, viewport, 24, scrollNote);
    assert.equal(event.defaultPrevented, false);
    assert.equal(
      applyRestore(),
      true,
      "non-forwarded input retains pending restore",
    );
  }
  restore();
  const verticalWheel = wheel();
  forwardTableWheel(verticalWheel, viewport, 24, scrollNote);
  assert.equal(verticalWheel.defaultPrevented, true);
  assert.equal(
    applyRestore(),
    false,
    "table-forwarded input clears pending restore",
  );

  // The destination reaches the edge while the visible note is still midway.
  const towardEdge = wheel({ deltaY: 1000 });
  forwardTableWheel(towardEdge, viewport, 24, scrollNote);
  restore();
  const chainedWheel = wheel();
  const callsBeforeChaining = scrolls.length;
  forwardTableWheel(chainedWheel, viewport, 24, scrollNote);
  dom.dispatchEvent(chainedWheel);
  assert.equal(chainedWheel.defaultPrevented, false);
  assert.equal(
    scrolls.length,
    callsBeforeChaining,
    "chaining does not stop in-flight motion",
  );
  assert.equal(
    applyRestore(),
    false,
    "a real vertical tick at the edge also cancels restore",
  );
});
