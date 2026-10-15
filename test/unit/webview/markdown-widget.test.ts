import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  CLICK_DRAG_PX,
  clickToEditReleaseCommits,
  latchClickDrag,
  markdownBlockIgnoresEventKind,
  type ClickToEditPress,
} from "../../../src/webview/ui/markdown-widget";

const root = new URL("../../../", import.meta.url).pathname;
const widgetSrc = readFileSync(
  path.join(root, "src/webview/ui/markdown-widget.ts"),
  "utf8",
);

test("selectionchange is always kept by the widget (native Mermaid labels)", () => {
  assert.equal(
    markdownBlockIgnoresEventKind({
      type: "selectionchange",
      targetIsElement: false,
      controlInsideWidget: false,
      nativeSelectableLabel: false,
    }),
    true,
  );
});

test("ordinary diagram mouse events are handed to CodeMirror", () => {
  assert.equal(
    markdownBlockIgnoresEventKind({
      type: "mousedown",
      targetIsElement: true,
      controlInsideWidget: false,
      nativeSelectableLabel: false,
    }),
    false,
  );
});

test("widget-local controls keep their mouse events", () => {
  assert.equal(
    markdownBlockIgnoresEventKind({
      type: "mousedown",
      targetIsElement: true,
      controlInsideWidget: true,
      nativeSelectableLabel: false,
    }),
    true,
  );
});

test("native selectable SVG labels keep their mouse events", () => {
  assert.equal(
    markdownBlockIgnoresEventKind({
      type: "mousedown",
      targetIsElement: true,
      controlInsideWidget: false,
      nativeSelectableLabel: true,
    }),
    true,
  );
});

test("non-element targets (other than selectionchange) do not force ignore", () => {
  assert.equal(
    markdownBlockIgnoresEventKind({
      type: "mouseup",
      targetIsElement: false,
      controlInsideWidget: false,
      nativeSelectableLabel: false,
    }),
    false,
  );
});

test("ignoreEvent bounds control detection to .hybrid-block (not outer contenteditable)", () => {
  assert.match(widgetSrc, /markdownBlockIgnoresEvent/);
  assert.match(widgetSrc, /\.hybrid-block/);
  assert.match(widgetSrc, /selectionchange/);
  assert.match(widgetSrc, /isBlockControl/);
  assert.match(widgetSrc, /isNativeSelectableLabel/);
  // Unbounded closest(interactive) was the P2 bug — must not be the ignore path.
  assert.doesNotMatch(
    widgetSrc,
    /ignoreEvent\(event: Event\): boolean \{\s*const target = event\.target;\s*return target instanceof Element && Boolean\(target\.closest\(interactive\)\)/,
  );
});

test("click-to-edit latches drag once the threshold is crossed, even if the pointer returns", () => {
  const press: ClickToEditPress = { x: 10, y: 10, dragged: false };
  latchClickDrag(press, 10 + CLICK_DRAG_PX, 10);
  assert.equal(press.dragged, false);
  latchClickDrag(press, 10 + CLICK_DRAG_PX + 1, 10);
  assert.equal(press.dragged, true);
  latchClickDrag(press, 10, 10);
  assert.equal(press.dragged, true);
});

test("click-to-edit commits only for a matching non-drag release over the widget", () => {
  const press: ClickToEditPress = { x: 0, y: 0, dragged: false };
  assert.equal(
    clickToEditReleaseCommits({
      press,
      button: 0,
      overWidget: true,
      onControl: false,
    }),
    true,
  );
  assert.equal(
    clickToEditReleaseCommits({
      press: null,
      button: 0,
      overWidget: true,
      onControl: false,
    }),
    false,
  );
  assert.equal(
    clickToEditReleaseCommits({
      press,
      button: 0,
      overWidget: false,
      onControl: false,
    }),
    false,
  );
  assert.equal(
    clickToEditReleaseCommits({
      press,
      button: 0,
      overWidget: true,
      onControl: true,
    }),
    false,
  );
  assert.equal(
    clickToEditReleaseCommits({
      press: { x: 0, y: 0, dragged: true },
      button: 0,
      overWidget: true,
      onControl: false,
    }),
    false,
  );
  assert.equal(
    clickToEditReleaseCommits({
      press,
      button: 2,
      overWidget: true,
      onControl: false,
    }),
    false,
  );
});

test("click-to-edit clears on outside release, blur, and pointercancel", () => {
  assert.match(widgetSrc, /pointercancel/);
  assert.match(widgetSrc, /addEventListener\("blur"/);
  assert.match(widgetSrc, /capture:\s*true/);
  assert.match(widgetSrc, /clearPress/);
  assert.match(widgetSrc, /latchClickDrag/);
  assert.match(widgetSrc, /clickToEditReleaseCommits/);
});
