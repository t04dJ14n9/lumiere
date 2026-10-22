import assert from "node:assert/strict";
import { test } from "node:test";
import {
  stickyHScrollTop,
  stickyHScrollVisible,
  stickyThumbMetrics,
} from "./sticky-hscroll";

test("sticky bar stays hidden when the table is not wider than its scrollport", () => {
  assert.equal(
    stickyHScrollVisible({
      overflowsX: false,
      tableTop: 100,
      tableBottom: 2000,
      viewportTop: 0,
      viewportBottom: 800,
      scrollbar: 14,
    }),
    false,
  );
});

test("sticky bar stays hidden when the table is fully above or below the viewport", () => {
  assert.equal(
    stickyHScrollVisible({
      overflowsX: true,
      tableTop: -2000,
      tableBottom: -100,
      viewportTop: 0,
      viewportBottom: 800,
      scrollbar: 14,
    }),
    false,
  );
  assert.equal(
    stickyHScrollVisible({
      overflowsX: true,
      tableTop: 900,
      tableBottom: 3000,
      viewportTop: 0,
      viewportBottom: 800,
      scrollbar: 14,
    }),
    false,
  );
});

test("sticky bar shows while a tall wide table fills the viewport and the native bar is below", () => {
  assert.equal(
    stickyHScrollVisible({
      overflowsX: true,
      tableTop: 40,
      tableBottom: 2400,
      viewportTop: 0,
      viewportBottom: 800,
      scrollbar: 14,
    }),
    true,
  );
  assert.equal(
    stickyHScrollVisible({
      overflowsX: true,
      tableTop: -900,
      tableBottom: 1500,
      viewportTop: 0,
      viewportBottom: 800,
      scrollbar: 14,
    }),
    true,
  );
});

test("sticky bar hides once the native horizontal scrollbar enters the viewport", () => {
  assert.equal(
    stickyHScrollVisible({
      overflowsX: true,
      tableTop: -1600,
      tableBottom: 790,
      viewportTop: 0,
      viewportBottom: 800,
      scrollbar: 14,
    }),
    false,
  );
  assert.equal(
    stickyHScrollVisible({
      overflowsX: true,
      tableTop: -1580,
      tableBottom: 810,
      viewportTop: 0,
      viewportBottom: 800,
      scrollbar: 14,
    }),
    false,
  );
});

test("sticky top pins the bar to the bottom edge of the note scrollport", () => {
  assert.equal(stickyHScrollTop(800, 14), 786);
  assert.equal(stickyHScrollTop(10, 14), 0);
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
