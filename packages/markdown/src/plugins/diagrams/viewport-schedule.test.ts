import test from "node:test";
import assert from "node:assert/strict";
import {
  MermaidViewportScheduler,
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

test("Mermaid work does not start until the fence stays near the viewport", async () => {
  const calls: string[] = [];
  const visibility = fakeVisibility();
  const scheduler = new MermaidViewportScheduler({
    settleMs: 40,
    watch: visibility.watch,
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

  // Fast scroll flash: enter and leave before settle.
  visibility.setVisible(a, true);
  visibility.setVisible(b, true);
  await delay(10);
  visibility.setVisible(a, false);
  visibility.setVisible(b, false);
  await delay(60);
  assert.deepEqual(calls, [], "flash-by diagrams must not call Mermaid");

  // C stays near the viewport long enough to settle.
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
  // Slow job has started (or is first in the serial queue). Scroll it away and
  // bring the next diagram into view before Mermaid finishes.
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
