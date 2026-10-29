import assert from "node:assert/strict";
import { test } from "node:test";
import {
  POINT_FIELDS,
  SketchFormatError,
  checkedPencilKit,
  decodeSketch,
  encodeSketch,
  strokesFingerprint,
  withPencilKit,
} from "../../src/format";
import { horizontalStroke, point, sketchOf } from "./helpers";

test("a sketch survives encoding and decoding unchanged", () => {
  const sketch = {
    ...sketchOf([
      horizontalStroke([2, 6, 10, 6, 2]),
      {
        tool: "pencil" as const,
        color: "#3355ffcc",
        points: [
          point(10.25, 20.5, {
            t: 0.0125,
            force: 0.731,
            altitude: 0.912,
            azimuth: -2.5,
            width: 3.5,
            opacity: 0.42,
          }),
        ],
      },
    ]),
    paper: { style: "grid" as const, spacing: 24, color: "none" },
  };
  assert.deepEqual(decodeSketch(encodeSketch(sketch)), sketch);
});

test("points are stored as one flat list in the order of `fields`", () => {
  const stored = JSON.parse(encodeSketch(sketchOf([horizontalStroke([4])])));
  assert.deepEqual(
    stored.fields,
    POINT_FIELDS.map(([name]) => name),
  );
  assert.deepEqual(stored.strokes[0].points, [
    0,
    0,
    0,
    0.4,
    Math.round((Math.PI / 2) * 1000) / 1000,
    0,
    4,
    1,
  ]);
});

test("numbers are rounded once, so a second save is byte for byte the first", () => {
  const sketch = sketchOf([
    {
      tool: "pen",
      color: "#000000",
      points: [point(1 / 3, 2 / 3, { t: 1 / 7 })],
    },
  ]);
  const once = encodeSketch(sketch);
  assert.equal(encodeSketch(decodeSketch(once)), once);
  assert.equal(decodeSketch(once).strokes[0]?.points[0]?.x, 0.33);
});

test("fields are read by name: reordered, unknown and missing optional ones", () => {
  const json = JSON.stringify({
    format: "lumiere-sketch",
    version: 1,
    width: 10,
    height: 10,
    fields: ["width", "roll", "y", "x"],
    strokes: [{ tool: "pen", color: "#000000", points: [3, 9, 2, 1] }],
  });
  const decoded = decodeSketch(json).strokes[0]?.points[0];
  assert.deepEqual(decoded, {
    x: 1,
    y: 2,
    t: 0,
    force: 0.5,
    altitude: Math.PI / 2,
    azimuth: 0,
    width: 3,
    opacity: 1,
  });
});

test("an ink or paper this version does not know falls back, so the sketch shows", () => {
  const json = JSON.stringify({
    format: "lumiere-sketch",
    version: 1,
    width: 10,
    height: 10,
    paper: { style: "music", spacing: 2, color: "#fafafa" },
    fields: ["x", "y", "width"],
    strokes: [{ tool: "quill", color: "#000000", points: [1, 2, 3] }],
  });
  const sketch = decodeSketch(json);
  assert.equal(sketch.strokes[0]?.tool, "pen");
  assert.deepEqual(sketch.paper, {
    style: "plain",
    spacing: 32,
    color: "#fafafa",
  });
});

test("damaged or hostile data is refused with a SketchFormatError", () => {
  const valid = {
    format: "lumiere-sketch",
    version: 1,
    width: 10,
    height: 10,
    fields: ["x", "y", "width"],
    strokes: [{ tool: "pen", color: "#000000", points: [1, 2, 3] }],
  };
  const broken: Record<string, unknown> = {
    "not JSON": "{",
    "another format": { ...valid, format: "excalidraw" },
    "a newer version": { ...valid, version: 2 },
    "a colour that is markup": {
      ...valid,
      strokes: [{ tool: "pen", color: '"/><script>', points: [1, 2, 3] }],
    },
    "a paper colour that is markup": {
      ...valid,
      paper: { style: "plain", spacing: 32, color: 'red" onload="x' },
    },
    "points that are not numbers": {
      ...valid,
      strokes: [{ tool: "pen", color: "#000000", points: [1, "2", 3] }],
    },
    "an incomplete point": {
      ...valid,
      strokes: [{ tool: "pen", color: "#000000", points: [1, 2] }],
    },
    "no x": { ...valid, fields: ["y", "width", "t"] },
    "a size that is not a size": { ...valid, width: -1 },
    "an endless page": { ...valid, height: 1e9 },
    "PencilKit data that is not base64": {
      ...valid,
      pencilKit: { data: "<svg>", strokes: "1:1:0" },
    },
  };
  for (const [name, value] of Object.entries(broken)) {
    const json = typeof value === "string" ? value : JSON.stringify(value);
    assert.throws(() => decodeSketch(json), SketchFormatError, name);
  }
});

test("out-of-range values are clamped to what an ink can draw", () => {
  const json = JSON.stringify({
    format: "lumiere-sketch",
    version: 1,
    width: 10,
    height: 10,
    fields: ["x", "y", "width", "force", "opacity", "altitude"],
    strokes: [{ tool: "pen", color: "#000000", points: [0, 0, 5e6, 7, -1, 9] }],
  });
  const decoded = decodeSketch(json).strokes[0]?.points[0];
  assert.equal(decoded?.width, 1000);
  assert.equal(decoded?.force, 1);
  assert.equal(decoded?.opacity, 0);
  assert.equal(decoded?.altitude, Math.PI / 2);
});

test("PencilKit's data is kept only while the strokes it was saved with are unchanged", () => {
  const sketch = withPencilKit(sketchOf([horizontalStroke([2, 4])]), "AAEC");
  assert.equal(checkedPencilKit(sketch), sketch);
  const decoded = decodeSketch(encodeSketch(sketch));
  assert.deepEqual(checkedPencilKit(decoded).pencilKit, sketch.pencilKit);

  const moved = {
    ...sketch,
    strokes: [horizontalStroke([2, 5])],
  };
  assert.equal(checkedPencilKit(moved).pencilKit, undefined);
  const dropped = { ...sketch, strokes: [] };
  assert.equal(checkedPencilKit(dropped).pencilKit, undefined);
});

test("the fingerprint counts strokes and points, and sees changes past rounding only", () => {
  const strokes = [horizontalStroke([2, 4, 6])];
  assert.match(strokesFingerprint(strokes), /^1:3:[0-9a-f]{8}$/);
  const nudged = [
    {
      ...strokes[0]!,
      points: strokes[0]!.points.map((p) => ({ ...p, x: p.x + 0.0001 })),
    },
  ];
  assert.equal(strokesFingerprint(nudged), strokesFingerprint(strokes));
});
