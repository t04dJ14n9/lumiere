// The iPad's canvas (InkPlugin.swift) as the `ink` service: what crosses the
// bridge is the sketch file's own metadata JSON.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  decodeSketch,
  emptySketch,
  encodeSketch,
  strokesFingerprint,
  type Sketch,
} from "@workshop/ink/format";
import { inkService, type InkBridge } from "../../src/native/ink";
import { INSERT_SKETCH, isNoteFocused } from "../../src/native/window-commands";

const drawn: Sketch = {
  ...emptySketch({ width: 720, height: 600 }),
  strokes: [
    {
      tool: "pencil",
      color: "#1f2328",
      points: [
        {
          x: 10.123,
          y: 20,
          t: 0,
          force: 0.3,
          altitude: 1.1,
          azimuth: 0.4,
          width: 2.345,
          opacity: 0.6,
        },
        {
          x: 30,
          y: 40,
          t: 0.02,
          force: 0.9,
          altitude: 1,
          azimuth: 0.5,
          width: 5,
          opacity: 0.8,
        },
      ],
    },
  ],
};

function bridge(answer: Awaited<ReturnType<InkBridge["draw"]>>) {
  const asked: Parameters<InkBridge["draw"]>[0][] = [];
  const fake: InkBridge = {
    capabilities: async () => ({
      engine: "pencilkit",
      pressure: true,
      toolPicker: true,
    }),
    draw: async (options) => {
      asked.push(options);
      return answer;
    },
  };
  return { fake, asked };
}

test("the canvas gets the sketch as its file stores it, and a new one blank", async () => {
  const { fake, asked } = bridge({ cancelled: true });
  const ink = inkService(fake);
  const existing = { ...drawn, pencilKit: { data: "AAAA", strokes: "x" } };

  assert.equal(await ink.draw({ title: "Plan", sketch: existing }), undefined);
  assert.equal(await ink.draw({ title: "New" }), undefined);

  assert.deepEqual(asked, [
    { title: "Plan", sketch: encodeSketch(existing) },
    { title: "New", sketch: encodeSketch(emptySketch()) },
  ]);
});

test("the drawing comes back checked, with PencilKit's data for exactly its strokes", async () => {
  const { fake } = bridge({
    sketch: encodeSketch(drawn),
    pencilKit: "UEtEUkFXSU5H",
  });

  const sketch = await inkService(fake).draw({ title: "Plan" });

  assert.ok(sketch);
  assert.equal(sketch.height, 600);
  assert.equal(sketch.strokes[0]!.points[0]!.width, 2.35, "as the file rounds");
  assert.deepEqual(sketch.pencilKit, {
    data: "UEtEUkFXSU5H",
    strokes: strokesFingerprint(decodeSketch(encodeSketch(drawn)).strokes),
  });
});

test("a drawing that is not a sketch is refused, not saved", async () => {
  const { fake } = bridge({ sketch: '{"format":"other"}' });
  await assert.rejects(inkService(fake).draw({ title: "Plan" }), {
    name: "SketchFormatError",
  });
});

test("the edit menu's Insert Sketch is the native one, for a focused note only", async () => {
  const source = await readFile(
    new URL(
      "../../ios/LumiereNative/Sources/LumiereNative/WindowCommandsPlugin.swift",
      import.meta.url,
    ),
    "utf8",
  );
  assert.equal(
    /static let insertSketch = "([^"]+)"/.exec(source)?.[1],
    INSERT_SKETCH,
  );
  const frame = (hidden: boolean, className = "editor-frame") => ({
    activeElement: {
      tagName: "IFRAME",
      classList: { contains: (name: string) => name === className },
      hasAttribute: (name: string) => name === "hidden" && hidden,
    } as unknown as Element,
  });
  assert.equal(isNoteFocused(frame(false)), true);
  assert.equal(isNoteFocused(frame(true)), false, "a hidden tab's page");
  assert.equal(isNoteFocused(frame(false, "pdf-frame")), false);
  assert.equal(isNoteFocused({ activeElement: null }), false);
});
