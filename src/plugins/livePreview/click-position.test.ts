import test from "node:test";
import assert from "node:assert/strict";
import {
  shouldApplySettledPointerCorrection,
  shouldCorrectPointerClick,
} from "./click-position";

const docA = { length: 200 };
const docB = { length: 210 };

test("corrects empty same-line pointer clicks when DOM caret disagrees", () => {
  assert.equal(
    shouldCorrectPointerClick({
      empty: true,
      dragged: false,
      domPos: 40,
      selectionHead: 30,
      sameLine: true,
    }),
    true,
  );
});

test("does not correct drags, non-empty ranges, cross-line, or agreement", () => {
  const base = {
    empty: true,
    dragged: false,
    domPos: 40,
    selectionHead: 30,
    sameLine: true,
  };
  assert.equal(shouldCorrectPointerClick({ ...base, dragged: true }), false);
  assert.equal(shouldCorrectPointerClick({ ...base, empty: false }), false);
  assert.equal(shouldCorrectPointerClick({ ...base, sameLine: false }), false);
  assert.equal(
    shouldCorrectPointerClick({ ...base, domPos: undefined }),
    false,
  );
  assert.equal(
    shouldCorrectPointerClick({ ...base, selectionHead: 40 }),
    false,
  );
});

test("settled correction applies only after release when selection still matches CM head", () => {
  const candidate = { head: 100, domPos: 104, sameLine: true, doc: docA };
  assert.equal(
    shouldApplySettledPointerCorrection({
      dragged: false,
      candidate,
      currentEmpty: true,
      currentHead: 100,
      currentDoc: docA,
    }),
    true,
  );
});

test("settled correction does not run for drags (mousedown candidate must not apply)", () => {
  const candidate = { head: 100, domPos: 104, sameLine: true, doc: docA };
  // Initial select.pointer sees dragged===false and would have corrected under
  // the old code; after release with dragged latched, correction must not apply
  // so CM's mouse-selection anchor stays consistent.
  assert.equal(
    shouldApplySettledPointerCorrection({
      dragged: true,
      candidate,
      currentEmpty: true,
      currentHead: 100,
      currentDoc: docA,
    }),
    false,
  );
  assert.equal(
    shouldApplySettledPointerCorrection({
      dragged: false,
      candidate: null,
      currentEmpty: true,
      currentHead: 100,
      currentDoc: docA,
    }),
    false,
  );
});

test("settled correction yields when another owner moved the selection", () => {
  const candidate = { head: 100, domPos: 104, sameLine: true, doc: docA };
  // Mermaid fence restore (or similar) already moved caret off the CM click head.
  assert.equal(
    shouldApplySettledPointerCorrection({
      dragged: false,
      candidate,
      currentEmpty: true,
      currentHead: 2,
      currentDoc: docA,
    }),
    false,
  );
  // Already at the DOM offset.
  assert.equal(
    shouldApplySettledPointerCorrection({
      dragged: false,
      candidate,
      currentEmpty: true,
      currentHead: 104,
      currentDoc: docA,
    }),
    false,
  );
  // Non-empty range (drag selection still active).
  assert.equal(
    shouldApplySettledPointerCorrection({
      dragged: false,
      candidate,
      currentEmpty: false,
      currentHead: 100,
      currentDoc: docA,
    }),
    false,
  );
});

test("settled correction skips when doc identity changed during the press", () => {
  // Edit after head can leave currentHead numerically unchanged while stored
  // domPos is layout-stale; refuse rather than mapping across a reflow.
  const candidate = { head: 100, domPos: 104, sameLine: true, doc: docA };
  assert.equal(
    shouldApplySettledPointerCorrection({
      dragged: false,
      candidate,
      currentEmpty: true,
      currentHead: 100,
      currentDoc: docB,
    }),
    false,
  );
});
