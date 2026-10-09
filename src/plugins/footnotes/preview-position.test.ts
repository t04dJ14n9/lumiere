import test from "node:test";
import assert from "node:assert/strict";
import { fitPreview } from "./preview-position";

const viewport = { width: 800, height: 600 };
const reference = { left: 700, right: 708, top: 100, bottom: 112 };

test("a preview that would run off the right edge moves left to fit", () => {
  const preview = { left: 696, right: 1116, top: 130, bottom: 200 };
  assert.deepEqual(fitPreview(preview, reference, viewport), {
    shift: 800 - 8 - 1116,
    isAbove: false,
  });
});

test("a preview that fits stays under its reference", () => {
  const preview = { left: 96, right: 516, top: 130, bottom: 200 };
  assert.deepEqual(fitPreview(preview, reference, viewport), {
    shift: 0,
    isAbove: false,
  });
});

test("a preview wider than the viewport keeps its start visible", () => {
  const preview = { left: 300, right: 1300, top: 130, bottom: 200 };
  assert.equal(fitPreview(preview, reference, viewport).shift, 8 - 300);
});

test("a preview near the bottom opens above when there is more room there", () => {
  const low = { left: 700, right: 708, top: 500, bottom: 512 };
  const preview = { left: 96, right: 516, top: 530, bottom: 680 };
  assert.equal(fitPreview(preview, low, viewport).isAbove, true);
  // Not when the room above is smaller.
  const high = { left: 700, right: 708, top: 40, bottom: 52 };
  const tall = { left: 96, right: 516, top: 70, bottom: 640 };
  assert.equal(fitPreview(tall, high, viewport).isAbove, false);
});
