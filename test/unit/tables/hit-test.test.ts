import test from "node:test";
import assert from "node:assert/strict";
import { nearestEntry } from "../../../src/plugins/tables/hit-test";

function fakeElement(
  left: number,
  right: number,
  top = 0,
  bottom = 20,
): Element {
  return {
    getBoundingClientRect() {
      return {
        left,
        right,
        top,
        bottom,
        width: right - left,
        height: bottom - top,
        x: left,
        y: top,
        toJSON() {
          return this;
        },
      };
    },
  } as Element;
}

test("nearestEntry picks the closest column when the pointer is past the right edge", () => {
  const cells = [fakeElement(0, 40), fakeElement(40, 80), fakeElement(80, 120)];
  assert.equal(nearestEntry(cells, "column", { x: 60, y: 10 }), 1);
  assert.equal(nearestEntry(cells, "column", { x: 200, y: 10 }), 2);
  assert.equal(nearestEntry(cells, "column", { x: -10, y: 10 }), 0);
});

test("nearestEntry picks the closest row past the bottom edge", () => {
  const rows = [
    fakeElement(0, 100, 0, 20),
    fakeElement(0, 100, 20, 40),
    fakeElement(0, 100, 40, 60),
  ];
  assert.equal(nearestEntry(rows, "row", { x: 10, y: 30 }), 1);
  assert.equal(nearestEntry(rows, "row", { x: 10, y: 90 }), 2);
});
