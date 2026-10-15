import test from "node:test";
import assert from "node:assert/strict";
import { forwardTableWheel } from "./wheel-scroll";

function wheel(overrides: Partial<WheelEvent> = {}) {
  return {
    deltaX: 0,
    deltaY: 120,
    deltaMode: 0,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    cancelable: true,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    ...overrides,
  };
}

function note(scrollTop = 600) {
  const calls: ScrollToOptions[] = [];
  return {
    scrollTop,
    scrollHeight: 2000,
    clientHeight: 500,
    calls,
    scrollBy(options: ScrollToOptions) {
      calls.push(options);
      this.scrollTop = Math.max(
        0,
        Math.min(
          this.scrollHeight - this.clientHeight,
          this.scrollTop + (options.top ?? 0),
        ),
      );
    },
  };
}

test("vertical table wheel input scrolls the note in either direction and cancels the nested default", () => {
  const viewport = note();
  for (const deltaY of [-120, 120]) {
    const before = viewport.scrollTop;
    const event = wheel({ deltaY });
    forwardTableWheel(event, viewport, 24);
    assert.equal(viewport.scrollTop, before + deltaY);
    assert.equal(event.defaultPrevented, true);
    assert.deepEqual(viewport.calls.at(-1), {
      left: 0,
      top: deltaY,
      behavior: "instant",
    });
  }
});

test("wheel pixels, fractional trackpad input, lines and pages use note geometry", () => {
  for (const [deltaMode, deltaY, distance] of [
    [0, 0.75, 0.75],
    [0, -0.75, -0.75],
    [1, 3, 72],
    [1, -3, -72],
    [2, 1, 500],
    [2, -1, -500],
  ] as const) {
    const viewport = note();
    const event = wheel({ deltaMode, deltaY });
    forwardTableWheel(event, viewport, 24);
    assert.equal(viewport.scrollTop, 600 + distance);
    assert.equal(event.defaultPrevented, true);
  }
});

test("horizontal and shift-wheel gestures retain the table's native scrolling", () => {
  for (const input of [
    { deltaX: 120, deltaY: 0 },
    { deltaX: -120, deltaY: 0 },
    { deltaX: 120, deltaY: 12 },
    { deltaX: 120, deltaY: 120 },
    { deltaX: 0, deltaY: 0 },
    { shiftKey: true },
  ]) {
    const viewport = note();
    const event = wheel(input);
    forwardTableWheel(event, viewport, 24);
    assert.equal(viewport.scrollTop, 600);
    assert.equal(event.defaultPrevented, false);
    assert.deepEqual(viewport.calls, []);
  }
});

test("a predominantly vertical trackpad gesture scrolls the note despite horizontal jitter", () => {
  const viewport = note();
  const event = wheel({ deltaX: 2, deltaY: -120 });
  forwardTableWheel(event, viewport, 24);
  assert.equal(viewport.scrollTop, 480);
  assert.equal(event.defaultPrevented, true);
});

test("zoom gestures, handled events and noncancelable events retain their defaults", () => {
  for (const input of [
    { ctrlKey: true },
    { metaKey: true },
    { defaultPrevented: true },
    { cancelable: false },
  ]) {
    const viewport = note();
    const event = wheel(input);
    forwardTableWheel(event, viewport, 24);
    assert.equal(viewport.scrollTop, 600);
    assert.equal(event.defaultPrevented, input.defaultPrevented ?? false);
    assert.deepEqual(viewport.calls, []);
  }
});

test("the note keeps native chaining at its limits and can scroll away from either edge", () => {
  for (const [scrollTop, deltaY] of [
    [0, -120],
    [1500, 120],
  ] as const) {
    const viewport = note(scrollTop);
    const blocked = wheel({ deltaY });
    forwardTableWheel(blocked, viewport, 24);
    assert.equal(blocked.defaultPrevented, false);
    assert.deepEqual(viewport.calls, []);
    const away = wheel({ deltaY: -deltaY });
    forwardTableWheel(away, viewport, 24);
    assert.equal(viewport.scrollTop, scrollTop - deltaY);
    assert.equal(away.defaultPrevented, true);
  }
});

test("a note without vertical overflow does not consume the wheel", () => {
  const viewport = note(0);
  viewport.scrollHeight = viewport.clientHeight;
  for (const deltaY of [-120, 120]) {
    const event = wheel({ deltaY });
    forwardTableWheel(event, viewport, 24);
    assert.equal(event.defaultPrevented, false);
  }
  assert.deepEqual(viewport.calls, []);
});
