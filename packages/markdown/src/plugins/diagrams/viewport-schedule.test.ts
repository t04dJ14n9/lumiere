import test from "node:test";
import assert from "node:assert/strict";
import {
  MermaidSvgCache,
  MermaidViewportScheduler,
  observeNearViewport,
  type VisibilityWatch,
} from "./viewport-schedule";

/** Controllable near-viewport gate for unit tests. */
function fakeVisibility(): {
  watch: VisibilityWatch;
  setVisible: (el: object, visible: boolean) => void;
} {
  const listeners = new Map<object, (visible: boolean) => void>();
  return {
    watch(element, onVisible) {
      listeners.set(element, onVisible);
      return () => listeners.delete(element);
    },
    setVisible(el, visible) {
      listeners.get(el)?.(visible);
    },
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Settle-only: no ahead-of-time idle prefetch. */
const noPrefetch = { scheduleIdle: () => () => {} };

test("Mermaid work does not start until the fence stays near the viewport", async () => {
  const calls: string[] = [];
  const visibility = fakeVisibility();
  const scheduler = new MermaidViewportScheduler({
    settleMs: 40,
    watch: visibility.watch,
    ...noPrefetch,
    render: async (source) => {
      calls.push(source);
      return `<svg data-src="${source}"></svg>`;
    },
  });

  const a = { id: "a" };
  const b = { id: "b" };
  const c = { id: "c" };
  const painted: string[] = [];

  scheduler.schedule(a as unknown as Element, "A", {
    onSvg: (svg) => painted.push(svg),
  });
  scheduler.schedule(b as unknown as Element, "B", {
    onSvg: (svg) => painted.push(svg),
  });
  scheduler.schedule(c as unknown as Element, "C", {
    onSvg: (svg) => painted.push(svg),
  });

  visibility.setVisible(a, true);
  visibility.setVisible(b, true);
  await delay(10);
  visibility.setVisible(a, false);
  visibility.setVisible(b, false);
  await delay(60);
  assert.deepEqual(calls, [], "flash-by diagrams must not call Mermaid");

  visibility.setVisible(c, true);
  await delay(60);
  await scheduler.whenIdle();
  assert.deepEqual(calls, ["C"]);
  assert.equal(painted.length, 1);
  assert.match(painted[0]!, /data-src="C"/);
});

test("leaving the viewport before paint cancels a settled Mermaid job so the next visible one runs", async () => {
  const order: string[] = [];
  let releaseSlow: () => void = () => {};
  const slow = new Promise<void>((resolve) => {
    releaseSlow = resolve;
  });
  const visibility = fakeVisibility();
  const scheduler = new MermaidViewportScheduler({
    settleMs: 20,
    watch: visibility.watch,
    ...noPrefetch,
    render: async (source) => {
      order.push(`start:${source}`);
      if (source === "slow") {
        await slow;
      }
      order.push(`done:${source}`);
      return `<svg>${source}</svg>`;
    },
  });

  const slowEl = { id: "slow" };
  const nextEl = { id: "next" };
  const painted: string[] = [];
  const disposeSlow = scheduler.schedule(slowEl as unknown as Element, "slow", {
    onSvg: (svg) => painted.push(svg),
  });
  scheduler.schedule(nextEl as unknown as Element, "next", {
    onSvg: (svg) => painted.push(svg),
  });

  visibility.setVisible(slowEl, true);
  await delay(30);
  disposeSlow();
  visibility.setVisible(nextEl, true);
  await delay(30);
  releaseSlow();
  await scheduler.whenIdle();

  assert.ok(
    order.includes("start:next") || order.includes("done:next"),
    `next diagram must run after cancel, got ${JSON.stringify(order)}`,
  );
  assert.ok(
    !painted.some((svg) => svg.includes("slow")),
    "cancelled slow diagram must not paint",
  );
  assert.ok(
    painted.some((svg) => svg.includes("next")),
    "visible next diagram must paint",
  );
});

test("leaving the near-viewport band before settle prevents Mermaid without dispose", async () => {
  const calls: string[] = [];
  const visibility = fakeVisibility();
  const scheduler = new MermaidViewportScheduler({
    settleMs: 40,
    watch: visibility.watch,
    ...noPrefetch,
    render: async (source) => {
      calls.push(source);
      return `<svg>${source}</svg>`;
    },
  });
  const el = { id: "flash" };
  scheduler.schedule(el as unknown as Element, "flash", {
    onSvg: () => {},
  });
  visibility.setVisible(el, true);
  await delay(10);
  visibility.setVisible(el, false);
  await delay(60);
  await scheduler.whenIdle();
  assert.deepEqual(calls, []);
});

test("idle prefetch fills the SVG cache so a later settle paints without a second Mermaid call", async () => {
  const calls: string[] = [];
  const idle: Array<() => void> = [];
  const visibility = fakeVisibility();
  const cache = new MermaidSvgCache(8);
  const scheduler = new MermaidViewportScheduler({
    settleMs: 20,
    watch: visibility.watch,
    cache,
    scheduleIdle: (run) => {
      idle.push(run);
      return () => {
        const index = idle.indexOf(run);
        if (index >= 0) {
          idle.splice(index, 1);
        }
      };
    },
    render: async (source) => {
      calls.push(source);
      return `<svg data-src="${source}"></svg>`;
    },
  });

  const el = { id: "warm" };
  const painted: string[] = [];
  scheduler.schedule(el as unknown as Element, "warm", {
    onSvg: (svg) => painted.push(svg),
  });

  assert.equal(idle.length, 1, "mount schedules one idle prefetch");
  idle.shift()!();
  await scheduler.whenIdle();
  assert.deepEqual(calls, ["warm"]);
  assert.equal(painted.length, 0, "prefetch alone must not paint");
  assert.equal(cache.get("warm"), `<svg data-src="warm"></svg>`);

  visibility.setVisible(el, true);
  await delay(30);
  await scheduler.whenIdle();
  assert.deepEqual(calls, ["warm"], "settle must reuse the cached SVG");
  assert.equal(painted.length, 1);
  assert.match(painted[0]!, /data-src="warm"/);
});

test("cache hit on remount paints immediately without calling Mermaid", async () => {
  const calls: string[] = [];
  const visibility = fakeVisibility();
  const cache = new MermaidSvgCache(8);
  cache.set("cached", `<svg data-src="cached"></svg>`);
  const scheduler = new MermaidViewportScheduler({
    settleMs: 20,
    watch: visibility.watch,
    cache,
    ...noPrefetch,
    render: async (source) => {
      calls.push(source);
      return `<svg data-src="${source}"></svg>`;
    },
  });

  const el = { id: "again" };
  const painted: string[] = [];
  scheduler.schedule(el as unknown as Element, "cached", {
    onSvg: (svg) => painted.push(svg),
  });
  assert.deepEqual(calls, []);
  assert.equal(painted.length, 1);
  assert.match(painted[0]!, /data-src="cached"/);
});

test("MermaidSvgCache evicts least-recently used entries", () => {
  const cache = new MermaidSvgCache(2);
  cache.set("a", "A");
  cache.set("b", "B");
  cache.get("a");
  cache.set("c", "C");
  assert.equal(cache.get("a"), "A");
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("c"), "C");
});

test("observeNearViewport marks connected near-viewport elements visible immediately via getBoundingClientRect", () => {
  const prevIO = globalThis.IntersectionObserver;
  const prevWin = (globalThis as { window?: unknown }).window;
  try {
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver =
      class {
        observe() {}
        disconnect() {}
      };
    (globalThis as { window?: unknown }).window = {
      innerHeight: 800,
      innerWidth: 1200,
    };
    const seen: boolean[] = [];
    const el = {
      isConnected: true,
      getBoundingClientRect: () => ({
        top: 100,
        bottom: 100,
        left: 20,
        right: 20,
      }),
    } as unknown as Element;
    const stop = observeNearViewport(el, (v) => seen.push(v));
    stop();
    assert.deepEqual(seen, [true]);
  } finally {
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver =
      prevIO;
    (globalThis as { window?: unknown }).window = prevWin;
  }
});
