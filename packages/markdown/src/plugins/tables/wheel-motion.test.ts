import test from "node:test";
import assert from "node:assert/strict";
import { TableWheelMotion } from "./wheel-motion";

function note(scrollTop = 600) {
  const calls: ScrollToOptions[] = [];
  return {
    scrollTop,
    scrollHeight: 2000,
    clientHeight: 500,
    calls,
    scrollTo(options: ScrollToOptions) {
      calls.push(options);
      if (options.behavior === "instant") {
        this.scrollTop = options.top ?? this.scrollTop;
      }
    },
  };
}

test("each tick moves the note immediately by the full delta", () => {
  for (const distance of [-120, 120]) {
    const viewport = note();
    const motion = new TableWheelMotion(viewport, () => false);
    motion.scroll(distance);
    assert.equal(viewport.scrollTop, 600 + distance);
    motion.scroll(distance);
    assert.deepEqual(viewport.calls, [
      { top: 600 + distance, behavior: "instant" },
      { top: 600 + distance * 2, behavior: "instant" },
    ]);
  }
});

test("fractional trackpad deltas apply immediately", () => {
  const viewport = note();
  const motion = new TableWheelMotion(viewport, () => false);
  for (let tick = 0; tick < 4; tick++) {
    motion.scroll(0.25);
  }
  assert.equal(viewport.scrollTop, 601);
  assert.deepEqual(
    viewport.calls.map((call) => call.top),
    [600.25, 600.5, 600.75, 601],
  );
});

test("reversing direction starts from the visible position", () => {
  for (const distance of [-120, 120]) {
    const viewport = note();
    const motion = new TableWheelMotion(viewport, () => false);
    motion.scroll(distance);
    motion.scroll(-distance);
    assert.deepEqual(viewport.calls.at(-1), {
      top: 600,
      behavior: "instant",
    });
    assert.equal(viewport.scrollTop, 600);
  }
});

test("an outward tick at a visible edge chains without scrolling", () => {
  for (const [edge, inward] of [
    [0, 120],
    [1500, -120],
  ] as const) {
    const viewport = note(edge);
    const motion = new TableWheelMotion(viewport, () => false);
    assert.equal(motion.scroll(-inward), false);
    assert.equal(viewport.calls.length, 0);
    assert.equal(motion.scroll(inward), true);
    assert.equal(viewport.calls.at(-1)?.top, edge + inward);
  }
});

test("destinations clamp at either note edge without banking excess distance", () => {
  for (const distance of [-1000, 1000]) {
    const viewport = note();
    const motion = new TableWheelMotion(viewport, () => false);
    motion.scroll(distance);
    motion.scroll(distance);
    const edge = distance < 0 ? 0 : 1500;
    assert.equal(viewport.scrollTop, edge);
    assert.equal(viewport.calls.at(-1)?.top, edge);
    motion.scroll(-distance / 10);
    assert.equal(viewport.calls.at(-1)?.top, edge - distance / 10);
  }
});

test("stop is a no-op without a pending smooth destination", () => {
  const viewport = note();
  const motion = new TableWheelMotion(viewport, () => false);
  motion.scroll(120);
  const calls = viewport.calls.length;
  motion.stop();
  motion.stop();
  assert.equal(viewport.calls.length, calls);
  viewport.scrollTop = 300;
  motion.scroll(120);
  assert.equal(viewport.calls.at(-1)?.top, 420);
});

test("observeScroll ignores progress when motion is instant", () => {
  const viewport = note();
  const motion = new TableWheelMotion(viewport, () => false);
  motion.scroll(200);
  viewport.scrollTop = 700;
  motion.observeScroll();
  motion.scroll(120);
  assert.equal(viewport.calls.at(-1)?.top, 820);
});

test("a shrinking note clamps the next tick to the new edge", () => {
  const viewport = note();
  const motion = new TableWheelMotion(viewport, () => false);
  motion.scroll(500);
  assert.equal(viewport.scrollTop, 1100);
  viewport.scrollHeight = 1200;
  motion.scroll(500);
  assert.equal(viewport.calls.at(-1)?.top, 700);
});

test("reduced-motion preference is consulted but motion stays instant", () => {
  const viewport = note();
  let reducedMotion = true;
  const motion = new TableWheelMotion(viewport, () => reducedMotion);
  motion.scroll(120);
  reducedMotion = false;
  motion.scroll(120);
  assert.ok(viewport.calls.every((call) => call.behavior === "instant"));
  assert.equal(viewport.scrollTop, 840);
});

test("two panels keep separate wheel positions", () => {
  const first = note();
  const second = note(200);
  const firstMotion = new TableWheelMotion(first, () => false);
  const secondMotion = new TableWheelMotion(second, () => false);
  firstMotion.scroll(120);
  secondMotion.scroll(-120);
  firstMotion.scroll(120);
  assert.equal(first.calls.at(-1)?.top, 840);
  assert.equal(second.calls.at(-1)?.top, 80);
});
