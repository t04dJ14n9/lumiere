import test from "node:test";
import assert from "node:assert/strict";
import {
  shouldApplySettledPointerCorrection,
  shouldCorrectPointerClick,
} from "./click-position";

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
  const candidate = { head: 100, domPos: 104, sameLine: true };
  assert.equal(
    shouldApplySettledPointerCorrection({
      dragged: false,
      candidate,
      currentEmpty: true,
      currentHead: 100,
    }),
    true,
  );
});

test("settled correction does not run for drags (mousedown candidate must not apply)", () => {
  const candidate = { head: 100, domPos: 104, sameLine: true };
  // Initial select.pointer sees dragged===false and would have corrected under
  // the old code; after release with dragged latched, correction must not apply
  // so CM's mouse-selection anchor stays consistent.
  assert.equal(
    shouldApplySettledPointerCorrection({
      dragged: true,
      candidate,
      currentEmpty: true,
      currentHead: 100,
    }),
    false,
  );
  assert.equal(
    shouldApplySettledPointerCorrection({
      dragged: false,
      candidate: null,
      currentEmpty: true,
      currentHead: 100,
    }),
    false,
  );
});

test("settled correction yields when another owner moved the selection", () => {
  const candidate = { head: 100, domPos: 104, sameLine: true };
  // Mermaid fence restore (or similar) already moved caret off the CM click head.
  assert.equal(
    shouldApplySettledPointerCorrection({
      dragged: false,
      candidate,
      currentEmpty: true,
      currentHead: 2,
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
    }),
    false,
  );
});
