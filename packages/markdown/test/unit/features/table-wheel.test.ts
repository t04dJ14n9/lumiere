import assert from "node:assert/strict";
import test from "node:test";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { createViewState } from "../../../src/plugins/editor/view-state";
import { viewState } from "../../../src/plugins/editor/protocol";
import { tablesWebview } from "../../../src/plugins/tables/webview";
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

test("vertical wheel over a table cancels a pending scroll restore", async (t) => {
  const { root, view } = fixture();
  t.after(() => root.dispose());
  const presentation = createViewState(root);
  Object.assign(view.scrollDOM, {
    scrollTop: 600,
    scrollHeight: 2000,
    clientHeight: 500,
    getBoundingClientRect: () => ({ top: 0 }),
  });
  // A wheel dispatched on this fake editor DOM targets the DOM itself, so it
  // answers `closest` as the node under the pointer would.
  let overTable = true;
  Object.assign(view.dom, {
    closest: (selector: string) =>
      overTable && selector === ".hybrid-table" ? {} : null,
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
  const restorePending = () =>
    restoreScroll(view, EditorSelection.cursor(0), {
      x: "nearest",
      y: "start",
      xMargin: 0,
      yMargin: 0,
    });
  for (const input of [
    { deltaX: 120, deltaY: 0 },
    { deltaX: 120, deltaY: 30 },
    { shiftKey: true },
    { ctrlKey: true },
    { metaKey: true },
    { deltaY: 0 },
  ]) {
    restore();
    view.dom.dispatchEvent(wheel(input));
    assert.equal(restorePending(), true, "a pan or zoom keeps the restore");
  }
  for (const input of [{}, { deltaY: -120 }, { deltaX: 30, deltaY: 120 }]) {
    restore();
    const event = wheel(input);
    view.dom.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false, "the browser keeps the wheel");
    assert.equal(restorePending(), false, "vertical table wheel cancels");
  }
  overTable = false;
  restore();
  view.dom.dispatchEvent(wheel());
  assert.equal(
    restorePending(),
    true,
    "CodeMirror's own observer handles the rest of the note",
  );
  await fiber.dispose();
  overTable = true;
  restore();
  view.dom.dispatchEvent(wheel());
  assert.equal(restorePending(), true, "the listener ends with the plugin");
});
