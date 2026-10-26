import assert from "node:assert/strict";
import { test } from "node:test";
import { stickyHScrollHidden, stickyThumbMetrics } from "./sticky-hscroll";

test("sticky bar shows only for an overflowing table whose native bar is off screen", () => {
  assert.equal(
    stickyHScrollHidden({ overflowsX: false, footVisible: false }),
    true,
  );
  assert.equal(
    stickyHScrollHidden({ overflowsX: true, footVisible: true }),
    true,
  );
  assert.equal(
    stickyHScrollHidden({ overflowsX: true, footVisible: false }),
    false,
  );
});

test("thumb metrics scale with overflow and clamp a minimum width", () => {
  assert.deepEqual(stickyThumbMetrics(800, 800, 0), {
    thumbWidth: 800,
    thumbLeft: 0,
    maxLeft: 0,
  });
  const mid = stickyThumbMetrics(800, 1600, 400);
  assert.equal(mid.maxLeft, 800);
  assert.equal(mid.thumbWidth, 400);
  assert.equal(mid.thumbLeft, 200);
  const tiny = stickyThumbMetrics(800, 80000, 0);
  assert.equal(tiny.thumbWidth, 24);
});
