import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TableStickyHScroll,
  stickyHScrollTop,
  stickyHScrollVisible,
  stickyThumbMetrics,
} from "./sticky-hscroll";

test("sticky bar stays hidden when the table is not wider than its scrollport", () => {
  assert.equal(
    stickyHScrollVisible({
      overflowsX: false,
      tableTop: 100,
      tableBottom: 2000,
      viewportTop: 0,
      viewportBottom: 800,
      scrollbar: 14,
    }),
    false,
  );
});

test("sticky bar stays hidden when the table is fully above or below the viewport", () => {
  assert.equal(
    stickyHScrollVisible({
      overflowsX: true,
      tableTop: -2000,
      tableBottom: -100,
      viewportTop: 0,
      viewportBottom: 800,
      scrollbar: 14,
    }),
    false,
  );
  assert.equal(
    stickyHScrollVisible({
      overflowsX: true,
      tableTop: 900,
      tableBottom: 3000,
      viewportTop: 0,
      viewportBottom: 800,
      scrollbar: 14,
    }),
    false,
  );
});

test("sticky bar shows while a tall wide table fills the viewport and the native bar is below", () => {
  assert.equal(
    stickyHScrollVisible({
      overflowsX: true,
      tableTop: 40,
      tableBottom: 2400,
      viewportTop: 0,
      viewportBottom: 800,
      scrollbar: 14,
    }),
    true,
  );
  assert.equal(
    stickyHScrollVisible({
      overflowsX: true,
      tableTop: -900,
      tableBottom: 1500,
      viewportTop: 0,
      viewportBottom: 800,
      scrollbar: 14,
    }),
    true,
  );
});

test("sticky bar hides once the native horizontal scrollbar enters the viewport", () => {
  assert.equal(
    stickyHScrollVisible({
      overflowsX: true,
      tableTop: -1600,
      tableBottom: 790,
      viewportTop: 0,
      viewportBottom: 800,
      scrollbar: 14,
    }),
    false,
  );
  assert.equal(
    stickyHScrollVisible({
      overflowsX: true,
      tableTop: -1580,
      tableBottom: 810,
      viewportTop: 0,
      viewportBottom: 800,
      scrollbar: 14,
    }),
    false,
  );
});

test("sticky top pins the bar to the bottom edge of the note scrollport", () => {
  assert.equal(stickyHScrollTop(800, 14), 786);
  assert.equal(stickyHScrollTop(10, 14), 0);
});

test("thumb metrics scale with overflow and clamp a minimum width", () => {
  assert.deepEqual(stickyThumbMetrics(800, 800, 0), {
    thumbWidth: 800,
    thumbLeft: 0,
    maxLeft: 0,
  });
  const mid = stickyThumbMetrics(800, 1600, 400);
  assert.equal(mid.maxLeft, 800);
  assert.equal(mid.thumbWidth, 400);
  assert.equal(mid.thumbLeft, 200);
  const tiny = stickyThumbMetrics(800, 80000, 0);
  assert.equal(tiny.thumbWidth, 24);
});

test("note scrolling skips layout when the table does not overflow horizontally", () => {
  const frames: FrameRequestCallback[] = [];
  const previous = {
    document: globalThis.document,
    window: globalThis.window,
    ResizeObserver: globalThis.ResizeObserver,
    requestAnimationFrame: globalThis.requestAnimationFrame,
  };
  let rects = 0;
  const listeners = new Map<string, Array<() => void>>();
  const table = {
    scrollWidth: 120,
    clientWidth: 200,
    clientHeight: 80,
    offsetHeight: 94,
    scrollLeft: 0,
    isConnected: true,
    firstElementChild: null,
    addEventListener(type: string, fn: () => void) {
      const list = listeners.get(type) ?? [];
      list.push(fn);
      listeners.set(type, list);
    },
    removeEventListener() {},
    getBoundingClientRect() {
      rects += 1;
      return {
        top: 0,
        bottom: 400,
        left: 0,
        right: 200,
        width: 200,
        height: 400,
      };
    },
  };
  const note = {
    ...table,
    scrollWidth: 200,
    clientWidth: 200,
    getBoundingClientRect() {
      rects += 1;
      return {
        top: 0,
        bottom: 300,
        left: 0,
        right: 200,
        width: 200,
        height: 300,
      };
    },
    dispatch(type: string) {
      for (const fn of listeners.get(type) ?? []) {
        fn();
      }
    },
  };
  globalThis.document = {
    createElement() {
      return {
        className: "",
        hidden: false,
        style: {},
        setAttribute() {},
        append() {},
        addEventListener() {},
        removeEventListener() {},
        remove() {},
      };
    },
  } as unknown as Document;
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  };
  globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
  } as unknown as Window & typeof globalThis;
  try {
    const bar = new TableStickyHScroll(
      table as unknown as HTMLElement,
      note as unknown as HTMLElement,
    );
    const queued = frames.splice(0);
    for (const frame of queued) {
      frame(0);
    }
    assert.equal(rects, 0);
    note.dispatch("scroll");
    assert.equal(frames.length, 0);
    table.scrollWidth = 800;
    bar.measure();
    assert.ok(rects > 0);
    const after = rects;
    note.dispatch("scroll");
    assert.equal(frames.length, 1);
    frames[0]?.(0);
    assert.ok(rects > after);
    bar.destroy();
  } finally {
    globalThis.document = previous.document;
    globalThis.window = previous.window;
    globalThis.ResizeObserver = previous.ResizeObserver;
    globalThis.requestAnimationFrame = previous.requestAnimationFrame;
  }
});
