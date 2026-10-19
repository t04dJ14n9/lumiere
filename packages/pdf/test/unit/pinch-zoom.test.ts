import assert from "node:assert/strict";
import { test } from "node:test";
import { clampGestureScale, pinchFactor } from "../../src/shared/pinch-zoom";

test("pinch scale is proportional to the delta: opposite deltas cancel, small deltas make small steps", () => {
  assert.equal(pinchFactor(0, 0), 1);
  assert.ok(Math.abs(pinchFactor(-5, 0) * pinchFactor(5, 0) - 1) < 1e-12);
  assert.ok(pinchFactor(-1, 0) > 1 && pinchFactor(-1, 0) < 1.011);
  // Many small events add up like one big one.
  let scale = 1;
  for (let i = 0; i < 40; i++) {
    scale *= pinchFactor(-2.5, 0);
  }
  assert.ok(Math.abs(scale - Math.exp(1)) < 1e-9);
  assert.equal(pinchFactor(-1, 1), pinchFactor(-40, 0));
});

test("a gesture cannot take the zoom past its limits", () => {
  assert.equal(clampGestureScale(1, 100), 4);
  assert.equal(clampGestureScale(2, 100), 2);
  assert.equal(clampGestureScale(1, 0.001), 0.25);
  assert.equal(clampGestureScale(1, 1.5), 1.5);
});
