import assert from "node:assert/strict";
import { test } from "node:test";
import { restoredZoomReady } from "../../src/shared/restored-zoom";

test("the initial scale of one cannot stand in for an accepted actual-size request", () => {
  assert.equal(restoredZoomReady(false, "fit-width", 1, 1), false);
  assert.equal(restoredZoomReady(true, "fit-width", 1, 1), false);
  assert.equal(restoredZoomReady(false, 1, 1, 1), false);
  assert.equal(restoredZoomReady(true, 1, 1, 1), true);
});

test("restoration waits for both the requested numeric mode and current scale", () => {
  assert.equal(restoredZoomReady(true, 2, 1, 2), false);
  assert.equal(restoredZoomReady(true, 1, 2, 2), false);
  assert.equal(restoredZoomReady(true, 2, 2, 2), true);
  // EmbedPDF rounds numeric scales down to three decimal places.
  assert.equal(restoredZoomReady(true, 1.234, 1.234, 1.2349), true);
});

test("late layout after frame 180 still restores, while newer input and disposal cancel", async () => {
  const { restoreWhenZoomReady } =
    await import("../../src/shared/restored-zoom");
  for (const stop of ["none", "input", "dispose"]) {
    const queue: (() => void)[] = [];
    let ready = false;
    let owns = true;
    let restored = 0;
    const dispose = restoreWhenZoomReady({
      ready: () => ready,
      ownsIntent: () => owns,
      requestZoom() {},
      restore() {
        restored++;
      },
      requestFrame(callback) {
        queue.push(callback);
        return queue.length;
      },
      cancelFrame() {
        queue.length = 0;
      },
    });
    for (let frame = 0; frame < 181; frame++) {
      queue.shift()!();
    }
    assert.equal(restored, 0);
    assert.equal(queue.length, 1);
    if (stop === "input") {
      owns = false;
    }
    if (stop === "dispose") {
      dispose();
    }
    ready = true;
    while (queue.length) {
      queue.shift()!();
    }
    assert.equal(restored, stop === "none" ? 1 : 0);
  }
});
