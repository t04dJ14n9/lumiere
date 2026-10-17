import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  CLICK_DRAG_PX,
  clickToEditReleaseCommits,
  latchClickDrag,
  liveFenceOffsets,
  markdownBlockIgnoresEventKind,
  shouldGuardFenceMouseDown,
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

test("blank-area mousedown stays with the widget (no CM caret in fence)", () => {
  assert.equal(
    markdownBlockIgnoresEventKind({
      type: "mousedown",
      targetIsElement: true,
      controlInsideWidget: false,
      nativeSelectableLabel: false,
    }),
    true,
  );
});

test("ignoreEvent keeps blank Mermaid area so source is not revealed without edit", () => {
  assert.match(widgetSrc, /markdownBlockIgnoresEvent/);
  assert.match(widgetSrc, /replace range/);
  assert.match(widgetSrc, /click-to-edit/);
  assert.match(widgetSrc, /MouseSelection/);
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
  assert.match(widgetSrc, /export function isNativeSelectableLabelTarget/);
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

test("Mermaid uses double-click-to-edit; math/code keep single-click", () => {
  const diagramsSrc = readFileSync(
    path.join(root, "src/plugins/diagrams/webview.ts"),
    "utf8",
  );
  const mathSrc = readFileSync(
    path.join(root, "src/plugins/math/webview.ts"),
    "utf8",
  );
  const codeSrc = readFileSync(
    path.join(root, "src/plugins/codeBlocks/webview.ts"),
    "utf8",
  );
  const embedsSrc = readFileSync(
    path.join(root, "src/plugins/embeds/webview.ts"),
    "utf8",
  );
  // Diagrams: no single-click reveal (avoids fence caret jump + Mermaid flash).
  assert.match(
    diagramsSrc,
    /new MarkdownBlock\(block, ctx\.render, "dblclick"\)/,
  );
  assert.match(widgetSrc, /bindDoubleClickToEdit/);
  assert.match(widgetSrc, /bindFenceClickGuard/);
  assert.match(widgetSrc, /clickToEdit === "dblclick"/);
  // Other reveal widgets keep the default single-click policy.
  assert.match(mathSrc, /new MarkdownBlock\(block, ctx\.render\)/);
  assert.doesNotMatch(mathSrc, /editingPreview\s*:/);
  assert.match(codeSrc, /new MarkdownBlock\(block, ctx\.render\)/);
  // Embeds still disable body click-to-edit entirely.
  assert.match(embedsSrc, /new MarkdownBlock\(block, ctx\.render, false\)/);
});

test("fence click guard swallows only outside-shell hits that map into the block", () => {
  const base = {
    button: 0,
    onControl: false,
    targetInsideShell: false,
    pos: 10,
    blockFrom: 5,
    blockTo: 20,
  };
  assert.equal(shouldGuardFenceMouseDown(base), true);
  assert.equal(shouldGuardFenceMouseDown({ ...base, pos: 5 }), true);
  assert.equal(shouldGuardFenceMouseDown({ ...base, pos: 20 }), true);
  assert.equal(shouldGuardFenceMouseDown({ ...base, pos: 4 }), false);
  assert.equal(shouldGuardFenceMouseDown({ ...base, pos: 21 }), false);
  assert.equal(shouldGuardFenceMouseDown({ ...base, pos: null }), false);
  assert.equal(
    shouldGuardFenceMouseDown({ ...base, targetInsideShell: true }),
    false,
  );
  assert.equal(shouldGuardFenceMouseDown({ ...base, onControl: true }), false);
  assert.equal(shouldGuardFenceMouseDown({ ...base, button: 2 }), false);
});

test("Mermaid SVG CSS captures transparent gap clicks on the widget", () => {
  const css = readFileSync(
    path.join(root, "src/plugins/diagrams/diagrams.css"),
    "utf8",
  );
  assert.match(css, /pointer-events:\s*all/);
});

test("fence click guard resolves live offsets from the shell, not captured from/to", () => {
  assert.match(widgetSrc, /liveFenceOffsets/);
  assert.match(widgetSrc, /posAtDOM\(shell\)/);
  // Must not feed the stale RenderBlock.from/to captured at toDOM into the guard.
  assert.doesNotMatch(
    widgetSrc,
    /shouldGuardFenceMouseDown\(\{[\s\S]*?blockFrom:\s*block\.from/,
  );
  const shell = {} as Node;
  const view = {
    posAtDOM(node: Node) {
      assert.equal(node, shell);
      return 110; // fence shifted after an edit above
    },
  };
  // Captured creation offsets were 100..150; span length 50 still applies.
  assert.deepEqual(liveFenceOffsets(view, shell, 50), {
    blockFrom: 110,
    blockTo: 160,
  });
  // Guard still swallows a margin hit that maps into the *live* fence.
  assert.equal(
    shouldGuardFenceMouseDown({
      button: 0,
      onControl: false,
      targetInsideShell: false,
      pos: 110,
      ...liveFenceOffsets(view, shell, 50),
    }),
    true,
  );
  // Stale captured range would miss this (and wrongly swallow nearby content).
  assert.equal(
    shouldGuardFenceMouseDown({
      button: 0,
      onControl: false,
      targetInsideShell: false,
      pos: 110,
      blockFrom: 100,
      blockTo: 150,
    }),
    true,
  );
  assert.equal(
    shouldGuardFenceMouseDown({
      button: 0,
      onControl: false,
      targetInsideShell: false,
      pos: 155,
      blockFrom: 100,
      blockTo: 150,
    }),
    false,
  );
  assert.equal(
    shouldGuardFenceMouseDown({
      button: 0,
      onControl: false,
      targetInsideShell: false,
      pos: 155,
      ...liveFenceOffsets(view, shell, 50),
    }),
    true,
  );
});
