import assert from "node:assert/strict";
import { test } from "node:test";
import {
  outlinePathData,
  strokeOutline,
  strokePieces,
  type Vec,
} from "../../src/format";
import { halfWidthAt, horizontalStroke, point } from "./helpers";

test("a stroke pressed harder in the middle is wider there", () => {
  const stroke = horizontalStroke([2, 2, 12, 2, 2]);
  const outline = strokeOutline(stroke.points);
  assert.ok(Math.abs(halfWidthAt(outline, 50, 1) - 6) < 0.01);
  assert.ok(Math.abs(halfWidthAt(outline, 25, 1) - 1) < 0.01);
  assert.ok(Math.abs(halfWidthAt(outline, 75, 1) - 1) < 0.01);
});

test("the outline follows each stored width, not one width for the stroke", () => {
  const widths = [1, 3, 5, 7, 9, 11, 13];
  const outline = strokeOutline(horizontalStroke(widths).points);
  widths.forEach((width, index) => {
    // Interior points sit exactly at x = 25 * index, offset by half their width.
    if (index > 0 && index < widths.length - 1) {
      assert.ok(
        Math.abs(halfWidthAt(outline, index * 25, 0.01) - width / 2) < 1e-9,
        `width at point ${index}`,
      );
    }
  });
});

test("both ends are rounded: the outline reaches half a width past each end", () => {
  const outline = strokeOutline(horizontalStroke([8, 8, 8]).points);
  const xs = outline.map(([x]) => x);
  assert.ok(Math.abs(Math.min(...xs) - -4) < 1e-9);
  assert.ok(Math.abs(Math.max(...xs) - 54) < 1e-9);
});

test("a single point is a dot as wide as its width", () => {
  const outline = strokeOutline([point(10, 10, { width: 6 })]);
  assert.ok(outline.length >= 8);
  for (const [x, y] of outline) {
    assert.ok(Math.abs(Math.hypot(x - 10, y - 10) - 3) < 1e-9);
  }
});

test("repeated samples at one place count once, keeping the wider", () => {
  const points = [
    point(0, 0, { width: 2 }),
    point(10, 0, { width: 2 }),
    point(10, 0.001, { width: 8 }),
    point(20, 0, { width: 2 }),
  ];
  const outline = strokeOutline(points);
  assert.ok(Math.abs(halfWidthAt(outline, 10, 0.01) - 4) < 0.01);
  assert.ok(outline.every(([x, y]) => isFinite(x) && isFinite(y)));
});

test("a hairpin turn stays within half a width of the stroke", () => {
  const points = [
    point(0, 0, { width: 4 }),
    point(50, 0, { width: 4 }),
    point(0, 1, { width: 4 }),
  ];
  const outline = strokeOutline(points);
  // Every vertex is within the stroke's reach of its centre line.
  for (const vertex of outline) {
    assert.ok(distanceToPolyline(vertex, points) <= 2 + 1e-9);
  }
  // The outer side rounds the turn's tip instead of spiking past it.
  assert.ok(Math.max(...outline.map(([x]) => x)) <= 52 + 1e-9);
  assert.ok(Math.max(...outline.map(([x]) => x)) > 51.9);
});

test("pieces meet at a shared point with the same offsets, and only the ends are round", () => {
  const points = [0, 1, 2, 3, 4].map((index) =>
    point(index * 10, 0, { width: 4, opacity: index < 2 ? 0.3 : 0.8 }),
  );
  const pieces = strokePieces(points, (p) => Math.round(p.opacity * 10));
  assert.deepEqual(
    pieces.map((piece) => piece.key),
    [3, 8],
  );
  const [light, dark] = pieces as [
    (typeof pieces)[number],
    (typeof pieces)[number],
  ];
  // The light piece runs to x = 20, where the dark piece starts.
  const shared = (outline: readonly Vec[]) =>
    outline
      .filter(([x]) => Math.abs(x - 20) < 1e-9)
      .sort((a, b) => a[1] - b[1]);
  assert.deepEqual(shared(light.outline), shared(dark.outline));
  assert.ok(Math.min(...light.outline.map(([x]) => x)) < 0, "round start");
  assert.ok(
    Math.max(...light.outline.map(([x]) => x)) <= 20,
    "flat at the join",
  );
  assert.ok(
    Math.min(...dark.outline.map(([x]) => x)) >= 20,
    "flat at the join",
  );
  assert.ok(Math.max(...dark.outline.map(([x]) => x)) > 40, "round end");
});

test("path data is one closed curve with rounded numbers", () => {
  const data = outlinePathData(strokeOutline(horizontalStroke([3, 3]).points));
  assert.match(data, /^M[-\d. ]+(Q[-\d. ]+)+Z$/);
  assert.equal(data.match(/M/g)?.length, 1);
  assert.ok(!/\d\.\d{3}/.test(data), "two decimals at most");
  assert.equal(outlinePathData([]), "");
});

function distanceToPolyline(
  [x, y]: Vec,
  points: readonly { x: number; y: number }[],
): number {
  let best = Infinity;
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1]!;
    const b = points[index]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const along = Math.max(
      0,
      Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)),
    );
    best = Math.min(
      best,
      Math.hypot(x - (a.x + along * dx), y - (a.y + along * dy)),
    );
  }
  return best;
}
