import test from "node:test";
import assert from "node:assert/strict";
import {
  MermaidQueue,
  MermaidSvgCache,
  watchMount,
  type MountWatch,
} from "./mount-queue";
import { RENDER_REMOUNT_EVENT } from "../render/api";

interface FakeElement {
  id: string;
  isConnected: boolean;
  /** Pixels from the window. */
  distance: number;
}

function element(id: string, distance = 0): FakeElement {
  return { id, isConnected: true, distance };
}

/** Mounts happen when the test says so. */
function mounts(): { watch: MountWatch; mount(el: FakeElement): void } {
  const listeners = new Map<object, () => void>();
  return {
    watch(el, onMount) {
      listeners.set(el, onMount);
      return () => listeners.delete(el);
    },
    mount(el) {
      el.isConnected = true;
      listeners.get(el)?.();
    },
  };
}

/** Frames advance only when the test says so. */
function frames(): { afterFrame(): Promise<void>; next(): Promise<void> } {
  const waiting: (() => void)[] = [];
  return {
    afterFrame: () => new Promise((resolve) => waiting.push(resolve)),
    async next() {
      waiting.shift()?.();
      // Let the queue run up to its next frame wait.
      for (let tick = 0; tick < 10; tick++) {
        await Promise.resolve();
      }
    },
  };
}

function queue(options: {
  watch: MountWatch;
  afterFrame?: () => Promise<void>;
  render?: (source: string) => Promise<string>;
  cache?: MermaidSvgCache;
}) {
  const rendered: string[] = [];
  const instance = new MermaidQueue({
    watchMount: options.watch,
    afterFrame: options.afterFrame ?? (() => Promise.resolve()),
    distance: (el) => (el as unknown as FakeElement).distance,
    cache: options.cache ?? new MermaidSvgCache(8),
    render:
      options.render ??
      (async (source) => {
        rendered.push(source);
        return `<svg>${source}</svg>`;
      }),
  });
  return { instance, rendered };
}

function schedule(
  target: MermaidQueue,
  el: FakeElement,
  source: string,
  painted: string[],
) {
  return target.schedule(el as unknown as Element, source, {
    onSvg: (svg) => painted.push(svg),
    onError: (error) => painted.push(`error: ${String(error)}`),
  });
}

test("a diagram renders as soon as it mounts, without waiting for scrolling to stop", async () => {
  const mount = mounts();
  const { instance, rendered } = queue({ watch: mount.watch });
  const painted: string[] = [];
  const diagram = element("a", 900);
  schedule(instance, diagram, "A", painted);
  assert.deepEqual(rendered, [], "nothing before the widget is in the page");
  mount.mount(diagram);
  await instance.whenIdle();
  assert.deepEqual(rendered, ["A"]);
  assert.deepEqual(painted, ["<svg>A</svg>"]);
});

test("diagrams render one at a time, a frame apart, nearest the window first", async () => {
  const mount = mounts();
  const frame = frames();
  const started: string[] = [];
  const finish = new Map<string, () => void>();
  const { instance } = queue({
    watch: mount.watch,
    afterFrame: frame.afterFrame,
    render: (source) =>
      new Promise((resolve) => {
        started.push(source);
        finish.set(source, () => resolve(`<svg>${source}</svg>`));
      }),
  });
  const painted: string[] = [];
  const far = element("far", 1500);
  const near = element("near", 0);
  const middle = element("middle", 400);
  for (const [el, source] of [
    [far, "far"],
    [near, "near"],
    [middle, "middle"],
  ] as const) {
    schedule(instance, el, source, painted);
    mount.mount(el);
  }
  assert.deepEqual(started, [], "the first render waits for a frame");
  await frame.next();
  assert.deepEqual(started, ["near"]);
  await frame.next();
  assert.deepEqual(started, ["near"], "the next waits for the first to finish");
  finish.get("near")!();
  await frame.next();
  await frame.next();
  assert.deepEqual(started, ["near", "middle"]);
  finish.get("middle")!();
  await frame.next();
  await frame.next();
  finish.get("far")!();
  await instance.whenIdle();
  assert.deepEqual(started, ["near", "middle", "far"]);
  assert.equal(painted.length, 3);
});

test("a diagram that leaves the page before its turn waits until it mounts again", async () => {
  const mount = mounts();
  const frame = frames();
  const { instance, rendered } = queue({
    watch: mount.watch,
    afterFrame: frame.afterFrame,
  });
  const painted: string[] = [];
  const diagram = element("a");
  schedule(instance, diagram, "A", painted);
  mount.mount(diagram);
  diagram.isConnected = false;
  await frame.next();
  await instance.whenIdle();
  assert.deepEqual(rendered, [], "scrolled past: no render");
  mount.mount(diagram);
  await frame.next();
  await instance.whenIdle();
  assert.deepEqual(rendered, ["A"]);
  assert.deepEqual(painted, ["<svg>A</svg>"]);
});

test("a source rendered before paints at once, without Mermaid", async () => {
  const mount = mounts();
  const cache = new MermaidSvgCache(8);
  const { instance, rendered } = queue({ watch: mount.watch, cache });
  const first: string[] = [];
  const diagram = element("a");
  schedule(instance, diagram, "A", first);
  mount.mount(diagram);
  await instance.whenIdle();
  const again: string[] = [];
  schedule(instance, element("b"), "A", again);
  assert.deepEqual(again, ["<svg>A</svg>"], "painted synchronously");
  assert.deepEqual(rendered, ["A"]);
});

test("a cancelled diagram neither renders nor paints, and a late result is still cached", async () => {
  const mount = mounts();
  const frame = frames();
  let release: () => void = () => {};
  const cache = new MermaidSvgCache(8);
  const started: string[] = [];
  const { instance } = queue({
    watch: mount.watch,
    afterFrame: frame.afterFrame,
    cache,
    render: (source) =>
      new Promise((resolve) => {
        started.push(source);
        release = () => resolve(`<svg>${source}</svg>`);
      }),
  });
  const painted: string[] = [];
  const waiting = element("waiting");
  const cancelWaiting = schedule(instance, waiting, "W", painted);
  mount.mount(waiting);
  cancelWaiting();
  await frame.next();
  await instance.whenIdle();
  assert.deepEqual(started, []);

  const rendering = element("rendering");
  const cancelRendering = schedule(instance, rendering, "R", painted);
  mount.mount(rendering);
  await frame.next();
  assert.deepEqual(started, ["R"]);
  cancelRendering();
  release();
  await instance.whenIdle();
  assert.deepEqual(painted, []);
  assert.equal(cache.get("R"), "<svg>R</svg>");
});

test("a failed render reports its error", async () => {
  const mount = mounts();
  const { instance } = queue({
    watch: mount.watch,
    render: async () => {
      throw new Error("bad diagram");
    },
  });
  const painted: string[] = [];
  const diagram = element("a");
  schedule(instance, diagram, "A", painted);
  mount.mount(diagram);
  await instance.whenIdle();
  assert.deepEqual(painted, ["error: Error: bad diagram"]);
});

test("MermaidSvgCache evicts the least recently used entry", () => {
  const cache = new MermaidSvgCache(2);
  cache.set("a", "A");
  cache.set("b", "B");
  assert.equal(cache.get("a"), "A");
  cache.set("c", "C");
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("a"), "A");
  assert.equal(cache.get("c"), "C");
});

test("watchMount takes a diagram up at once, and again each time its block remounts", () => {
  const target = new EventTarget();
  let count = 0;
  const stop = watchMount(target as unknown as Element, () => count++);
  assert.equal(count, 1, "scheduled as its block is built");
  target.dispatchEvent(new Event(RENDER_REMOUNT_EVENT));
  assert.equal(count, 2);
  stop();
  target.dispatchEvent(new Event(RENDER_REMOUNT_EVENT));
  assert.equal(count, 2);
});
