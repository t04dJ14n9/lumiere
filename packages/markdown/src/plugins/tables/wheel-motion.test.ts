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

test("the first and later ticks animate and preserve distance still in flight", () => {
  for (const distance of [-120, 120]) {
    const viewport = note();
    const motion = new TableWheelMotion(viewport, () => false);
    motion.scroll(distance);
    assert.equal(viewport.scrollTop, 600, "the first tick must not jump");
    viewport.scrollTop += distance / 4;
    motion.observeScroll();
    motion.scroll(distance);
    motion.scroll(distance);
    assert.deepEqual(viewport.calls, [
      { top: 600 + distance, behavior: "smooth" },
      { top: 600 + distance * 2, behavior: "smooth" },
      { top: 600 + distance * 3, behavior: "smooth" },
    ]);
  }
});

test("fractional trackpad deltas accumulate before the first animation frame", () => {
  const viewport = note();
  const motion = new TableWheelMotion(viewport, () => false);
  for (let tick = 0; tick < 4; tick++) {
    motion.scroll(0.25);
  }
  assert.deepEqual(
    viewport.calls.map((call) => call.top),
    [600.25, 600.5, 600.75, 601],
  );
});

test("intermediate fractional scroll events retain the full destination", () => {
  for (const direction of [-1, 1]) {
    const viewport = note();
    const motion = new TableWheelMotion(viewport, () => false);
    motion.scroll(direction * 0.25);
    for (const progress of [0.1, 0.2]) {
      viewport.scrollTop = 600 + direction * progress;
      motion.observeScroll();
      assert.deepEqual(viewport.calls, [
        { top: 600 + direction * 0.25, behavior: "smooth" },
      ]);
    }
    motion.scroll(direction * 0.25);
    assert.equal(viewport.calls.at(-1)?.top, 600 + direction * 0.5);
    viewport.scrollTop = 600 + direction * 0.5;
    motion.observeScroll();
    viewport.scrollTop = 900;
    motion.scroll(direction * 0.25);
    assert.equal(viewport.calls.at(-1)?.top, 900 + direction * 0.25);
  }
});

test("reversing direction starts from the visible position", () => {
  for (const distance of [-120, 120]) {
    const viewport = note();
    const motion = new TableWheelMotion(viewport, () => false);
    motion.scroll(distance);
    viewport.scrollTop += distance / 4;
    motion.observeScroll();
    motion.scroll(-distance);
    assert.deepEqual(viewport.calls.at(-1), {
      top: viewport.scrollTop - distance,
      behavior: "smooth",
    });
  }
});

test("an outward reversal at a visible edge cancels unfinished inward motion and chains", () => {
  for (const [edge, inward] of [
    [0, 120],
    [1500, -120],
  ] as const) {
    const viewport = note(edge);
    const motion = new TableWheelMotion(viewport, () => false);
    assert.equal(motion.scroll(inward), true);
    assert.equal(viewport.scrollTop, edge);
    assert.equal(motion.scroll(-inward), false);
    assert.deepEqual(viewport.calls.at(-1), { top: edge, behavior: "instant" });
    motion.scroll(inward);
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
    assert.equal(viewport.calls.at(-1)?.top, edge);
    viewport.scrollTop = edge;
    motion.observeScroll();
    motion.scroll(-distance / 10);
    assert.equal(viewport.calls.at(-1)?.top, edge - distance / 10);
  }
});

test("finishing or interrupting a scroll forgets its destination", () => {
  const viewport = note();
  const motion = new TableWheelMotion(viewport, () => false);
  motion.scroll(120);
  viewport.scrollTop = 720;
  motion.observeScroll();
  viewport.scrollTop = 900;
  motion.scroll(120);
  assert.equal(viewport.calls.at(-1)?.top, 1020);
  viewport.scrollTop = 930;
  motion.stop();
  assert.deepEqual(viewport.calls.at(-1), { top: 930, behavior: "instant" });
  const calls = viewport.calls.length;
  motion.stop();
  assert.equal(viewport.calls.length, calls, "stopping twice is harmless");
  viewport.scrollTop = 300;
  motion.scroll(120);
  assert.equal(viewport.calls.at(-1)?.top, 420);
});

test("a scroll moving away from or beyond the destination cancels pending motion", () => {
  for (const externalTop of [300, 1000]) {
    const viewport = note();
    const motion = new TableWheelMotion(viewport, () => false);
    motion.scroll(120);
    viewport.scrollTop = externalTop;
    motion.observeScroll();
    assert.deepEqual(viewport.calls.at(-1), {
      top: externalTop,
      behavior: "instant",
    });
    motion.scroll(120);
    assert.equal(viewport.calls.at(-1)?.top, externalTop + 120);
  }
});

test("a shrinking note releases a destination once its new edge is reached", () => {
  const viewport = note();
  const motion = new TableWheelMotion(viewport, () => false);
  motion.scroll(500);
  viewport.scrollHeight = 1200;
  viewport.scrollTop = 700;
  motion.observeScroll();
  viewport.scrollHeight = 2000;
  motion.scroll(120);
  assert.equal(viewport.calls.at(-1)?.top, 820);
});

test("reduced motion applies each delta immediately and can change between ticks", () => {
  const viewport = note();
  let reducedMotion = true;
  const motion = new TableWheelMotion(viewport, () => reducedMotion);
  motion.scroll(0.75);
  motion.scroll(120);
  assert.equal(viewport.scrollTop, 720.75);
  assert.ok(viewport.calls.every((call) => call.behavior === "instant"));
  reducedMotion = false;
  motion.scroll(120);
  assert.deepEqual(viewport.calls.at(-1), {
    top: 840.75,
    behavior: "smooth",
  });
});

test("two panels keep separate pending wheel destinations", () => {
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
