import assert from "node:assert/strict";
import { test } from "node:test";
import { anglesFromTilt, penAngles } from "../../src/canvas/input";
import { canvasKeyAction } from "../../src/canvas/keys";
import { inkAt } from "../../src/canvas/nibs";
import { MIN_STEP, StrokeRecorder } from "../../src/canvas/recorder";
import {
  FASTEST_PRESSURE,
  RESTING_PRESSURE,
  SpeedPressure,
  pressureForSpeed,
} from "../../src/canvas/speed";

const PEN = { tool: "pen", width: 3 } as const;

function mouse(options: { nib?: typeof PEN } = {}): StrokeRecorder {
  return new StrokeRecorder({
    nib: options.nib ?? PEN,
    color: "#1f2328",
    sensesPressure: false,
  });
}

/** A horizontal drag at `speed` points per second, sampled every 8 ms. */
function drag(recorder: StrokeRecorder, speed: number, samples = 40): void {
  for (let index = 0; index < samples; index++) {
    const time = index * 8;
    recorder.add({ x: (speed * time) / 1000, y: 0, time, pressure: 0.5 });
  }
}

function lastWidth(recorder: StrokeRecorder): number {
  return recorder.stroke().points.at(-1)?.width ?? NaN;
}

test("a mouse dragged quickly draws a thinner line than one dragged slowly", () => {
  const slow = mouse();
  const fast = mouse();
  drag(slow, 100);
  drag(fast, 3000);
  assert.ok(lastWidth(fast) < lastWidth(slow) * 0.6);
  // The force stored is what the mouse read, whatever the width drawn.
  for (const point of fast.stroke().points) {
    assert.equal(point.force, 0.5);
  }
});

test("speed eases the width rather than jumping with each sample", () => {
  const recorder = mouse();
  drag(recorder, 3000, 12);
  const widths = recorder.stroke().points.map((point) => point.width);
  for (let index = 1; index < widths.length; index++) {
    assert.ok(
      (widths[index] ?? 0) <= (widths[index - 1] ?? 0) + 1e-9,
      "speeding up only thins the line",
    );
  }
  assert.ok((widths[1] ?? 0) > (widths.at(-1) ?? 0), "it took a few samples");
});

test("pressure from speed stays between resting and fastest", () => {
  assert.equal(pressureForSpeed(0), RESTING_PRESSURE);
  assert.ok(pressureForSpeed(1e9) > FASTEST_PRESSURE);
  assert.ok(pressureForSpeed(1e9) < FASTEST_PRESSURE + 0.01);
  assert.equal(pressureForSpeed(-5), RESTING_PRESSURE);
  const speed = new SpeedPressure();
  assert.equal(speed.next({ x: 0, y: 0, time: 0 }), RESTING_PRESSURE);
});

test("samples sharing a time stamp count their distance once time passes", () => {
  const together = new SpeedPressure();
  together.next({ x: 0, y: 0, time: 0 });
  // Coalesced samples with one stamp carry no speed of their own.
  assert.equal(together.next({ x: 5, y: 0, time: 0 }), RESTING_PRESSURE);
  const after = together.next({ x: 10, y: 0, time: 10 });
  const apart = new SpeedPressure();
  apart.next({ x: 0, y: 0, time: 0 });
  assert.equal(apart.next({ x: 10, y: 0, time: 10 }), after);
});

test("a pen's own pressure sets the width, and its tilt is kept", () => {
  const recorder = new StrokeRecorder({
    nib: PEN,
    color: "#1f2328",
    sensesPressure: true,
  });
  recorder.add({ x: 0, y: 0, time: 1000, pressure: 0.2, tiltX: 30 });
  recorder.add({ x: 10, y: 0, time: 1010, pressure: 0.9, tiltX: 30 });
  const [light, hard] = recorder.stroke().points;
  assert.ok(light && hard);
  assert.ok(hard.width > light.width * 2);
  assert.deepEqual(
    [light.force, hard.force, hard.t],
    [0.2, 0.9, 0.01],
    "raw force, and seconds since the stroke began",
  );
  assert.ok(Math.abs(hard.altitude - Math.PI / 3) < 1e-9, "leaning 30°");
  assert.ok(Math.abs(hard.azimuth) < 1e-9, "towards +x");
});

test("a mouse is stored upright, whatever angles the browser reports", () => {
  const recorder = mouse();
  recorder.add({
    x: 0,
    y: 0,
    time: 0,
    pressure: 0.5,
    altitudeAngle: 0.3,
    azimuthAngle: 2,
  });
  const [point] = recorder.stroke().points;
  assert.equal(point?.altitude, Math.PI / 2);
  assert.equal(point?.azimuth, 0);
});

test("samples closer than a step replace the last point instead of piling up", () => {
  const recorder = mouse();
  for (let index = 0; index <= 100; index++) {
    recorder.add({ x: index * 0.05, y: 0, time: index, pressure: 0.5 });
  }
  const points = recorder.stroke().points;
  assert.ok(points.length < 10, `kept ${points.length} of 101 samples`);
  assert.equal(points[0]?.x, 0, "the first point is where it landed");
  assert.equal(points.at(-1)?.x, 5, "the last is where it is now");
  for (let index = 1; index < points.length - 1; index++) {
    const step = (points[index]?.x ?? 0) - (points[index - 1]?.x ?? 0);
    assert.ok(step >= MIN_STEP - 1e-9);
  }
});

test("tilt becomes altitude and azimuth as Pointer Events define them", () => {
  assert.deepEqual(anglesFromTilt(0, 0), {
    altitude: Math.PI / 2,
    azimuth: 0,
  });
  const towardsY = anglesFromTilt(0, 45);
  assert.ok(Math.abs(towardsY.altitude - Math.PI / 4) < 1e-9);
  assert.ok(Math.abs(towardsY.azimuth - Math.PI / 2) < 1e-9);
  const backwards = anglesFromTilt(-60, 0);
  assert.ok(Math.abs(backwards.altitude - Math.PI / 6) < 1e-9);
  assert.ok(Math.abs(backwards.azimuth - Math.PI) < 1e-9);
  const flat = anglesFromTilt(90, 0);
  assert.ok(flat.altitude < 1e-9, "lying flat");
  // The browser's own angles win, in range.
  const own = penAngles({
    x: 0,
    y: 0,
    time: 0,
    pressure: 0.5,
    tiltX: 80,
    altitudeAngle: 1,
    azimuthAngle: -Math.PI / 2,
  });
  assert.equal(own.altitude, 1);
  assert.ok(Math.abs(own.azimuth - (3 * Math.PI) / 2) < 1e-9);
});

test("each ink answers pressure and tilt as its kind does", () => {
  const upright = Math.PI / 2;
  const pen = (pressure: number) => inkAt(PEN, { pressure, altitude: upright });
  assert.ok(pen(1).width > pen(0.5).width && pen(0.5).width > pen(0).width);
  assert.equal(pen(0.5).width, 3, "a resting mouse draws the chosen width");
  assert.equal(pen(1).opacity, 1);

  const pencil = { tool: "pencil", width: 3 } as const;
  const light = inkAt(pencil, { pressure: 0.1, altitude: upright });
  const hard = inkAt(pencil, { pressure: 0.9, altitude: upright });
  const tilted = inkAt(pencil, { pressure: 0.9, altitude: 0.2 });
  assert.ok(hard.opacity > light.opacity, "pressing shades darker");
  assert.ok(tilted.width > hard.width * 2, "tilting lays the lead's side");

  const marker = { tool: "marker", width: 15 } as const;
  const soft = inkAt(marker, { pressure: 0, altitude: upright });
  const firm = inkAt(marker, { pressure: 1, altitude: upright });
  assert.ok(firm.width / soft.width < 1.5, "a marker stays nearly even");
});

test("the canvas keeps its keys, and lets the system's through", () => {
  const press = (
    code: string,
    options: { shift?: boolean; mod?: boolean } = {},
  ) =>
    canvasKeyAction({
      key: code === "Escape" ? "Escape" : "x",
      code,
      mod: options.mod ?? true,
      shiftKey: options.shift ?? false,
    });
  assert.equal(press("KeyZ"), "undo");
  assert.equal(press("KeyZ", { shift: true }), "redo");
  assert.equal(press("KeyY"), "redo");
  assert.equal(press("Enter"), "done");
  assert.equal(press("Escape", { mod: false }), "cancel");
  assert.equal(press("KeyW"), "swallow", "⌘W would close the note behind");
  assert.equal(press("KeyQ"), undefined, "quitting is the system's");
  assert.equal(press("KeyZ", { mod: false }), undefined, "typing is nobody's");
});
