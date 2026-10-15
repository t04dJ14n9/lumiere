import test from "node:test";
import assert from "node:assert/strict";
import { placePreview } from "./preview-position";

const viewport = { width: 800, height: 600 };
const reference = { left: 700, right: 708, top: 100, bottom: 112 };
const size = { width: 420, height: 70 };

test("a preview that would run off the right edge moves left to fit", () => {
  assert.deepEqual(placePreview(size, reference, viewport), {
    left: 800 - 8 - 420,
    top: 112 + 12,
    isAbove: false,
  });
});

test("a preview that fits stays under its reference", () => {
  const mid = { left: 100, right: 108, top: 100, bottom: 112 };
  assert.deepEqual(placePreview(size, mid, viewport), {
    left: 96,
    top: 124,
    isAbove: false,
  });
});

test("a preview wider than the viewport keeps its start visible", () => {
  const wide = { width: 1000, height: 70 };
  assert.equal(placePreview(wide, reference, viewport).left, 8);
});

test("a preview near the bottom opens above when there is more room there", () => {
  const low = { left: 100, right: 108, top: 500, bottom: 512 };
  const tall = { width: 420, height: 150 };
  assert.equal(placePreview(tall, low, viewport).isAbove, true);
  assert.equal(placePreview(tall, low, viewport).top, 500 - 12 - 150);
  // Not when the room above is smaller.
  const high = { left: 100, right: 108, top: 40, bottom: 52 };
  assert.equal(
    placePreview({ width: 420, height: 570 }, high, viewport).isAbove,
    false,
  );
});
