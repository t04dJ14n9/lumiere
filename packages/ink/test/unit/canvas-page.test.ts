import assert from "node:assert/strict";
import { test } from "node:test";
import { withPencilKit } from "../../src/format";
import { segmentDistance, strokesTouched } from "../../src/canvas/erase";
import { StrokeHistory } from "../../src/canvas/history";
import {
  GROWTH_MARGIN,
  MAX_SCALE,
  finishedSketch,
  pageHeightHolding,
  pageLayout,
  strokeBounds,
} from "../../src/canvas/page";
import { horizontalStroke, point, sketchOf } from "./helpers";

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

test("the page grows to hold what is drawn below it, and never shrinks", () => {
  const low = {
    tool: "pen" as const,
    color: "#1f2328",
    points: [point(10, 500, { width: 6 })],
  };
  assert.equal(pageHeightHolding([low], 480), 503 + GROWTH_MARGIN);
  assert.equal(pageHeightHolding([low], 900), 900);
  assert.equal(pageHeightHolding([], 480), 480);
  assert.deepEqual(strokeBounds(low), {
    left: 7,
    top: 497,
    right: 13,
    bottom: 503,
  });
});

test("the page fills the view's width, within a gutter and a largest scale", () => {
  assert.deepEqual(pageLayout(400, 720), { scale: 400 / 720, left: 0, top: 0 });
  const roomy = pageLayout(1000, 720);
  assert.equal(roomy.scale, (1000 - 48) / 720);
  assert.equal(roomy.top, 24);
  const wide = pageLayout(3000, 720);
  assert.equal(wide.scale, MAX_SCALE);
  assert.equal(wide.left, (3000 - 720 * MAX_SCALE) / 2, "centred");
});

test("the eraser removes the strokes its path comes within reach of", () => {
  const near = horizontalStroke([2, 2, 2]); // y = 0, x 0 to 50
  const far = {
    ...horizontalStroke([2, 2]),
    points: [point(0, 100, { width: 2 }), point(50, 100, { width: 2 })],
  };
  const dot = {
    ...horizontalStroke([10]),
    points: [point(200, 0, { width: 10 })],
  };
  const strokes = [near, far, dot];
  const crossing = strokesTouched(
    strokes,
    { from: { x: 20, y: -30 }, to: { x: 20, y: 30 } },
    1,
  );
  assert.deepEqual([...crossing], [near]);
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

test("Done gives back the sketch as opened when its strokes are as they were", () => {
  const opened = withPencilKit(sketchOf([horizontalStroke([2, 4])]), "UEtE");
  assert.equal(finishedSketch(opened, opened.strokes, 600), opened);
  const drawn = [...opened.strokes, horizontalStroke([3])];
  const changed = finishedSketch(opened, drawn, 600);
  assert.equal(changed.pencilKit, undefined, "PencilKit's data no longer fits");
  assert.deepEqual(changed, {
    width: opened.width,
    height: 600,
    paper: opened.paper,
    strokes: drawn,
  });
});
