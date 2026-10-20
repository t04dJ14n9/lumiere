import test from "node:test";
import assert from "node:assert/strict";
import { cellPointerOffset, nearestCellTextOffset } from "./cell-pointer";

test("nearest edge: left of (or on) the text start opens at 0", () => {
  assert.equal(nearestCellTextOffset(6, 10, 20, 80), 0);
  assert.equal(nearestCellTextOffset(6, 20, 20, 80), 0);
});

test("nearest edge: right of the text end opens at the end", () => {
  assert.equal(nearestCellTextOffset(6, 90, 20, 80), 6);
  assert.equal(nearestCellTextOffset(6, 80, 20, 80), 6);
});

test("nearest edge: ties and empty cells prefer the start", () => {
  assert.equal(nearestCellTextOffset(6, 50, 20, 80), 0);
  assert.equal(nearestCellTextOffset(0, 90, 20, 80), 0);
});

test("cellPointerOffset keeps a successful rendered map", () => {
  const element = {
    ownerDocument: { createRange: () => ({ selectNodeContents() {} }) },
    getBoundingClientRect: () => ({
      left: 0,
      right: 100,
      width: 100,
      height: 20,
    }),
  } as unknown as HTMLElement;
  assert.equal(
    cellPointerOffset("Banana", element, { clientX: 1, clientY: 1 }, () => 2),
    2,
  );
});

test("cellPointerOffset falls back to the nearest text edge when map misses", () => {
  const textBounds = { left: 40, right: 100, width: 60, height: 16 };
  const element = {
    ownerDocument: {
      createRange: () => ({
        selectNodeContents() {},
        getBoundingClientRect: () => textBounds,
      }),
    },
    getBoundingClientRect: () => ({
      left: 20,
      right: 120,
      width: 100,
      height: 24,
    }),
  } as unknown as HTMLElement;
  assert.equal(
    cellPointerOffset(
      "Banana",
      element,
      { clientX: 25, clientY: 10 },
      () => undefined,
    ),
    0,
  );
  assert.equal(
    cellPointerOffset(
      "Banana",
      element,
      { clientX: 115, clientY: 10 },
      () => undefined,
    ),
    6,
  );
});
