import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { EditorSelection, EditorState } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import {
  CLICK_DRAG_PX,
  clickToEditReleaseCommits,
  latchClickDrag,
  markdownBlockIgnoresEventKind,
  type ClickToEditPress,
} from "../../../src/webview/ui/block-pointer";
import {
  fenceGuardSelection,
  liveFenceOffsets,
  ownsFenceGuardRelease,
  resolveFenceGuardSelection,
  setFenceGuardSelectionEffect,
  shouldGuardFenceMouseDown,
  shouldRestoreFenceClick,
  type FenceGuardPress,
} from "../../../src/webview/ui/fence-click-guard";

const root = new URL("../../../", import.meta.url).pathname;

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

test("fence click guard arms only outside-shell hits that map into the block", () => {
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
  // Shift/Cmd/chrome must not arm — CM keeps selection / scrollbar.
  assert.equal(shouldGuardFenceMouseDown({ ...base, modified: true }), false);
  assert.equal(shouldGuardFenceMouseDown({ ...base, onChrome: true }), false);
});

test("plain completed fence margin click restores pre-press selection", () => {
  const press: FenceGuardPress = {
    x: 0,
    y: 0,
    dragged: false,
    selection: EditorSelection.single(3),
    doc: { length: 10 },
  };
  assert.equal(
    shouldRestoreFenceClick({ press, button: 0, modified: false }),
    true,
  );
  assert.equal(
    shouldRestoreFenceClick({
      press: { ...press, dragged: true },
      button: 0,
      modified: false,
    }),
    false,
  );
  assert.equal(
    shouldRestoreFenceClick({ press, button: 0, modified: true }),
    false,
  );
  assert.equal(
    shouldRestoreFenceClick({ press: null, button: 0, modified: false }),
    false,
  );
});

test("Mermaid SVG CSS captures transparent gap clicks on the widget", () => {
  const css = readFileSync(
    path.join(root, "src/plugins/diagrams/diagrams.css"),
    "utf8",
  );
  assert.match(css, /pointer-events:\s*all/);
});

test("fence click guard resolves live offsets from the shell, not captured from/to", () => {
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
  // Guard still arms a margin hit that maps into the *live* fence.
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

test("fence restore skips when doc identity changed and no mapped selection", () => {
  const savedDoc = { length: 100 };
  const currentDoc = { length: 110 };
  const selection = EditorSelection.single(50);
  assert.equal(
    resolveFenceGuardSelection({
      selection,
      savedDoc,
      currentDoc,
    }),
    null,
  );
  assert.equal(
    resolveFenceGuardSelection({
      selection,
      savedDoc,
      currentDoc: savedDoc,
    }),
    selection,
  );
});

test("fence restore prefers mapped selection over stale snapshot", () => {
  const savedDoc = { length: 100 };
  const currentDoc = { length: 110 };
  const stale = EditorSelection.single(50);
  const mapped = EditorSelection.single(60);
  assert.equal(
    resolveFenceGuardSelection({
      selection: stale,
      savedDoc,
      currentDoc,
      mapped,
    }),
    mapped,
  );
  // Explicit map callback when docs diverge.
  assert.equal(
    resolveFenceGuardSelection({
      selection: stale,
      savedDoc,
      currentDoc,
      map: () => mapped,
    }),
    mapped,
  );
});

test("fenceGuardSelection field maps through intervening doc changes", () => {
  const extensions: Extension[] = [fenceGuardSelection];
  let state = EditorState.create({
    doc: "abcdefghij",
    selection: EditorSelection.single(5),
    extensions,
  });
  state = state.update({
    effects: setFenceGuardSelectionEffect(EditorSelection.single(5)),
  }).state;
  assert.equal(state.field(fenceGuardSelection)?.main.head, 5);
  state = state.update({
    changes: { from: 0, to: 0, insert: "XXXX" },
  }).state;
  // Insert before the caret → mapped head advances by 4 (like pointerSelection).
  assert.equal(state.field(fenceGuardSelection)?.main.head, 9);
  assert.equal(state.doc.length, 14);
});

test("duplicate mouseup without release ownership does not clear mapped selection", () => {
  // Second window/document mouseup: takePress already null — must not clear.
  assert.equal(ownsFenceGuardRelease(null), false);
  const press: FenceGuardPress = {
    x: 0,
    y: 0,
    dragged: false,
    selection: EditorSelection.single(5),
    doc: { length: 10 },
  };
  assert.equal(ownsFenceGuardRelease(press), true);
});
