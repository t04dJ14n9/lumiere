import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_PAPER,
  paperMarks,
  paperMarksWithin,
  withPencilKit,
  type InkStroke,
} from "../../src/format";
import { CROP_MARGIN, cropFrame, savedSketch } from "../../src/canvas/board";
import { strokeBounds } from "../../src/canvas/bounds";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  OPENING_MARGIN,
  dragged,
  openingCamera,
  pinched,
  toSketch,
  zoomedAt,
  type Camera,
} from "../../src/canvas/camera";
import { segmentDistance, strokesTouched } from "../../src/canvas/erase";
import { StrokeHistory } from "../../src/canvas/history";
import { horizontalStroke, point, sketchOf } from "./helpers";

/** A stroke from (10, 40) to (110, 40), 4 wide: its ink reaches 8 to 112 across, 38 to 42 down. */
const LINE: InkStroke = {
  tool: "pen",
  color: "#1f2328",
  points: [point(10, 40, { width: 4 }), point(110, 40, { width: 4 })],
};

function near(actual: number, expected: number, message?: string): void {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    message ?? `${actual} ≈ ${expected}`,
  );
}

test("undo and redo step through the strokes, apart from any other history", () => {
  const first = horizontalStroke([2, 2]);
  const second = horizontalStroke([4, 4]);
  const history = new StrokeHistory([first]);
  assert.equal(history.isChanged, false);
  assert.equal(history.canUndo, false);
  history.apply([first, second]);
  history.apply([second]);
  assert.deepEqual(history.strokes, [second]);
  assert.ok(history.undo());
  assert.deepEqual(history.strokes, [first, second]);
  assert.ok(history.redo());
  assert.deepEqual(history.strokes, [second]);
  history.undo();
  history.undo();
  assert.equal(history.isChanged, false, "all undone is as opened");
  assert.equal(history.undo(), false);
  history.apply([]);
  assert.equal(history.canRedo, false, "a new change drops the redos");
  assert.equal(history.isChanged, true);
});

test("Done cuts a sketch to its strokes, with a margin, on the paper's lines", () => {
  assert.deepEqual(strokeBounds(LINE), {
    left: 8,
    top: 38,
    right: 112,
    bottom: 42,
  });
  // 8 - 16 = -8 down to -32; 38 - 16 = 22 down to 0; 112 + 16 = 128; 42 + 16 = 58 up to 64.
  assert.deepEqual(cropFrame([LINE], 32), {
    left: -32,
    top: 0,
    right: 128,
    bottom: 64,
  });
  const saved = savedSketch(sketchOf([]), [LINE], true);
  assert.ok(saved);
  assert.equal(saved.width, 160);
  assert.equal(saved.height, 64);
  assert.deepEqual(
    saved.strokes[0]?.points.map(({ x, y }) => [x, y]),
    [
      [42, 40],
      [142, 40],
    ],
    "moved by whole steps of the paper, so its lines stay under the strokes",
  );
  assert.equal(CROP_MARGIN, 16, "as the iPad's Board.swift");
});

test("a new sketch left blank is not saved, nor one drawn and all erased", () => {
  const blank = sketchOf([]);
  assert.equal(savedSketch(blank, blank.strokes, true), undefined);
  assert.equal(savedSketch(blank, [], true), undefined);
});

test("a sketch reopened and left as it was comes back as it was", () => {
  const opened = withPencilKit(sketchOf([LINE]), "UEtE");
  assert.equal(savedSketch(opened, opened.strokes, false), opened);
  const changed = savedSketch(opened, [LINE, horizontalStroke([3])], false);
  assert.equal(
    changed?.pencilKit,
    undefined,
    "PencilKit's data no longer fits",
  );
});

test("a sketch that existed, erased to nothing, is saved empty at its old size", () => {
  const opened = { ...sketchOf([LINE]), width: 333, height: 222 };
  assert.deepEqual(savedSketch(opened, [], false), {
    width: 333,
    height: 222,
    paper: DEFAULT_PAPER,
    strokes: [],
  });
});

test("the sketch opens at its own size, centred, a margin below the bar", () => {
  const camera = openingCamera({ width: 1000, height: 800 }, { width: 720 });
  assert.deepEqual(camera, { x: -140, y: -OPENING_MARGIN, zoom: 1 });
  const narrow = openingCamera({ width: 400, height: 800 }, { width: 720 });
  near(narrow.zoom, (400 - 2 * OPENING_MARGIN) / 720, "shown whole across");
  near(toSketch(narrow, { x: 200, y: 0 }).x, 360, "centred");
  assert.equal(
    openingCamera({ width: 50, height: 50 }, { width: 720 }).zoom,
    MIN_ZOOM,
  );
});

test("zooming keeps the point under the pointer still, from a quarter to four times", () => {
  const camera: Camera = { x: -140, y: -24, zoom: 1 };
  const at = { x: 300, y: 200 };
  const zoomed = zoomedAt(camera, at, 2);
  assert.equal(zoomed.zoom, 2);
  assert.deepEqual(toSketch(zoomed, at), toSketch(camera, at));
  assert.equal(zoomedAt(camera, at, 100).zoom, MAX_ZOOM);
  assert.equal(zoomedAt(camera, at, 0.001).zoom, MIN_ZOOM);
});

test("a drag moves the paper with the hand, at any zoom", () => {
  const camera: Camera = { x: 10, y: 20, zoom: 2 };
  const moved = dragged(camera, 30, -40);
  assert.deepEqual(
    toSketch(moved, { x: 30, y: -40 }),
    toSketch(camera, { x: 0, y: 0 }),
  );
});

test("two fingers pan with their middle and zoom with their spread", () => {
  const camera: Camera = { x: 0, y: 0, zoom: 1 };
  const spread = pinched(
    camera,
    [
      { x: 150, y: 100 },
      { x: 250, y: 100 },
    ],
    [
      { x: 100, y: 100 },
      { x: 300, y: 100 },
    ],
  );
  near(spread.zoom, 2);
  assert.deepEqual(toSketch(spread, { x: 200, y: 100 }), { x: 200, y: 100 });
  const moved = pinched(
    camera,
    [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
    ],
    [
      { x: 130, y: 110 },
      { x: 230, y: 110 },
    ],
  );
  assert.deepEqual(moved, { x: -30, y: -10, zoom: 1 });
});

test("the paper's marks fall on its spacing anywhere, past the page too", () => {
  const grid = { style: "grid" as const, spacing: 32, color: "#ffffff" };
  const area = { left: -50, top: -40, right: 40, bottom: 33 };
  const marks = paperMarksWithin(grid, area);
  assert.deepEqual(marks.across, [-31.5, 0.5, 32.5]);
  assert.deepEqual(marks.down, [-31.5, 0.5, 32.5]);
  const dotted = paperMarksWithin({ ...grid, style: "dotted" }, area);
  assert.equal(dotted.dots.length, 9);
  assert.deepEqual(dotted.dots[0], [-32, -32]);
  assert.deepEqual(
    paperMarks(grid, { width: 100, height: 70 }).across,
    [32.5, 64.5],
    "a page's marks are those strictly inside it",
  );
});

test("the eraser removes the strokes its path comes within reach of", () => {
  const close = horizontalStroke([2, 2, 2]); // y = 0, x 0 to 50
  const far = {
    ...horizontalStroke([2, 2]),
    points: [point(0, 100, { width: 2 }), point(50, 100, { width: 2 })],
  };
  const dot = {
    ...horizontalStroke([10]),
    points: [point(200, 0, { width: 10 })],
  };
  const strokes = [close, far, dot];
  const crossing = strokesTouched(
    strokes,
    { from: { x: 20, y: -30 }, to: { x: 20, y: 30 } },
    1,
  );
  assert.deepEqual([...crossing], [close]);
  const grazing = strokesTouched(
    strokes,
    { from: { x: 200, y: 7.5 }, to: { x: 200, y: 7.5 } },
    3,
  );
  assert.deepEqual([...grazing], [dot], "a dot's width counts");
  const missing = strokesTouched(
    strokes,
    { from: { x: 0, y: 50 }, to: { x: 50, y: 50 } },
    5,
  );
  assert.equal(missing.size, 0);
});

test("segments' distance is 0 where they cross, and the gap where they do not", () => {
  const across = { from: { x: 0, y: 0 }, to: { x: 10, y: 0 } };
  assert.equal(
    segmentDistance(across, { from: { x: 5, y: -5 }, to: { x: 5, y: 5 } }),
    0,
  );
  assert.equal(
    segmentDistance(across, { from: { x: 13, y: 4 }, to: { x: 20, y: 4 } }),
    5,
  );
  assert.equal(
    segmentDistance(across, { from: { x: 4, y: 3 }, to: { x: 4, y: 3 } }),
    3,
  );
});
