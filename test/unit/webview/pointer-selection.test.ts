import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { EditorSelection, EditorState } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import {
  BUTTON_UP_RELEASE_MS,
  isPointerSelecting,
  onGestureEnd,
  pointerSelection,
  pointerSelectionToggled,
  revealRanges,
  setPointerSelection,
  shouldApplyDeferredThaw,
  shouldStartPointerFreeze,
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

test("pointer freeze skips native Mermaid SVG label mousedowns", () => {
  assert.equal(
    shouldStartPointerFreeze({
      button: 0,
      nativeSelectableLabel: false,
    }),
    true,
  );
  assert.equal(
    shouldStartPointerFreeze({
      button: 0,
      nativeSelectableLabel: true,
    }),
    false,
  );
  assert.equal(
    shouldStartPointerFreeze({
      button: 2,
      nativeSelectableLabel: false,
    }),
    false,
  );
});

test("a new primary press may refresh freeze even when a prior gesture is still frozen", () => {
  // alreadyFrozen must not be a sole reject reason — the tracking plugin
  // invalidates prior thaw/buttons-up timers and re-establishes freeze.
  assert.equal(
    shouldStartPointerFreeze({
      button: 0,
      nativeSelectableLabel: false,
    }),
    true,
  );
});

test("deferred thaw is generation-scoped so an earlier gesture cannot clear a newer freeze", () => {
  // release → new press before deferred thaw: old thaw must not clear it
  assert.equal(
    shouldApplyDeferredThaw({
      scheduledGeneration: 1,
      currentGeneration: 2,
      stillFrozen: true,
      aborted: false,
      connected: true,
    }),
    false,
  );
  assert.equal(
    shouldApplyDeferredThaw({
      scheduledGeneration: 2,
      currentGeneration: 2,
      stillFrozen: true,
      aborted: false,
      connected: true,
    }),
    true,
  );
  assert.equal(
    shouldApplyDeferredThaw({
      scheduledGeneration: 2,
      currentGeneration: 2,
      stillFrozen: false,
      aborted: false,
      connected: true,
    }),
    false,
  );
  assert.equal(
    shouldApplyDeferredThaw({
      scheduledGeneration: 2,
      currentGeneration: 2,
      stillFrozen: true,
      aborted: true,
      connected: true,
    }),
    false,
  );
});

test("hover buttons-up timer does not arm while inactive; cancelPending drops a stale release", async () => {
  // hover → press → stationary hold: a buttons-up timer from idle hover must
  // not call end after the press. isActive gates arming; cancelPending covers
  // any timer that was already scheduled for a prior active gesture.
  const events = new AbortController();
  let ended = 0;
  let active = false;
  const doc = new EventTarget() as Document;
  const view = new EventTarget() as Window;
  Object.defineProperty(doc, "defaultView", { value: view });

  const handle = onGestureEnd(doc, () => {
    ended += 1;
  }, events.signal, () => active);

  doc.dispatchEvent(
    Object.assign(new Event("mousemove", { bubbles: true }), { buttons: 0 }),
  );
  await new Promise((resolve) => setTimeout(resolve, BUTTON_UP_RELEASE_MS + 20));
  assert.equal(ended, 0, "idle hover must not schedule a buttons-up release");

  active = true;
  doc.dispatchEvent(
    Object.assign(new Event("mousemove", { bubbles: true }), { buttons: 0 }),
  );
  // New press takes ownership before the debounce elapses.
  active = true;
  handle.cancelPending();
  await new Promise((resolve) => setTimeout(resolve, BUTTON_UP_RELEASE_MS + 20));
  assert.equal(ended, 0, "cancelPending must drop the prior buttons-up release");

  // Sustained buttons-up while still active does end the gesture.
  doc.dispatchEvent(
    Object.assign(new Event("mousemove", { bubbles: true }), { buttons: 0 }),
  );
  await new Promise((resolve) => setTimeout(resolve, BUTTON_UP_RELEASE_MS + 20));
  assert.equal(ended, 1, "active sustained buttons-up must release");

  events.abort();
});

test("pointer thaw is deferred with setTimeout and generation-scoped", () => {
  const root = new URL("../../../", import.meta.url).pathname;
  const src = readFileSync(
    path.join(root, "src/webview/ui/pointer-selection.ts"),
    "utf8",
  );
  assert.match(src, /shouldStartPointerFreeze/);
  assert.match(src, /isNativeSelectableLabelTarget/);
  assert.match(src, /shouldApplyDeferredThaw/);
  assert.match(src, /gestureGeneration/);
  assert.match(src, /cancelPending/);
  assert.match(src, /setTimeout/);
  assert.doesNotMatch(
    src,
    /queueMicrotask\(\(\) => \{[\s\S]*press\.of\(null\)/,
  );
  // alreadyFrozen must not be the sole reject path for a new press.
  assert.doesNotMatch(src, /alreadyFrozen/);
});
