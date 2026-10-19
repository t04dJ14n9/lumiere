import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BitmapCache,
  KEPT_FULL_BITMAPS,
  lowScale,
  prefetchRange,
  type RenderTask,
} from "../../src/shared/bitmap-cache";

/** Render tasks the test finishes by hand. */
function harness() {
  const tasks: {
    page: number;
    scale: number;
    dpr: number;
    done: (blob: string) => void;
    fail: () => void;
    aborted: boolean;
  }[] = [];
  const urls = new Set<string>();
  let next = 0;
  const cache = new BitmapCache(
    (page, scale, dpr) => {
      const record = {
        page,
        scale,
        dpr,
        aborted: false,
        done: (_blob: string): void => undefined,
        fail: (): void => undefined,
      };
      tasks.push(record);
      const task: RenderTask = {
        wait(ok, bad) {
          record.done = (blob: string) => ok(blob);
          record.fail = () => bad(new Error("failed"));
        },
        abort() {
          record.aborted = true;
        },
      };
      return task;
    },
    {
      create: (blob) => {
        const url = `blob:${String(blob)}#${next++}`;
        urls.add(url);
        return url;
      },
      revoke: (url) => void urls.delete(url),
    },
  );
  return { cache, tasks, urls };
}

test("a request is answered when the render finishes, and at once for a ready bitmap", () => {
  const { cache, tasks } = harness();
  const got: string[] = [];
  cache.request(
    { quality: "full", page: 3, scale: 1, dpr: 2 },
    (url) => void got.push(url),
  );
  assert.equal(tasks.length, 1);
  assert.equal(got.length, 0);
  tasks[0]!.done("p3");
  assert.equal(got.length, 1);
  cache.request(
    { quality: "full", page: 3, scale: 1, dpr: 2 },
    (url) => void got.push(url),
  );
  assert.equal(got.length, 2, "ready: answered synchronously");
  assert.equal(tasks.length, 1, "no second render");
  assert.equal(
    cache.peek({ quality: "full", page: 3, scale: 1, dpr: 2 }),
    got[0],
  );
});

test("two requests for one bitmap share one render, and it is aborted only when both are cancelled", () => {
  const { cache, tasks } = harness();
  const a = cache.request(
    { quality: "low", page: 1, scale: 0.5, dpr: 1 },
    () => undefined,
  );
  const b = cache.request(
    { quality: "low", page: 1, scale: 0.5, dpr: 1 },
    () => undefined,
  );
  assert.equal(tasks.length, 1);
  a();
  assert.equal(tasks[0]!.aborted, false);
  b();
  assert.equal(tasks[0]!.aborted, true);
  cache.request(
    { quality: "low", page: 1, scale: 0.5, dpr: 1 },
    () => undefined,
  );
  assert.equal(
    tasks.length,
    2,
    "an aborted bitmap is rendered again when asked for",
  );
});

test("a render that finishes after its cancel is not shown or kept", () => {
  const { cache, tasks, urls } = harness();
  const got: string[] = [];
  const cancel = cache.request(
    { quality: "full", page: 0, scale: 1, dpr: 1 },
    (url) => void got.push(url),
  );
  cancel();
  tasks[0]!.done("late");
  assert.equal(got.length, 0);
  assert.equal(urls.size, 0);
});

test("lowOf gives the newest low bitmap of a page whatever its scale", () => {
  const { cache, tasks } = harness();
  cache.request(
    { quality: "low", page: 5, scale: 0.25, dpr: 1 },
    () => undefined,
  );
  tasks[0]!.done("old");
  cache.request(
    { quality: "low", page: 5, scale: 0.5, dpr: 1 },
    () => undefined,
  );
  tasks[1]!.done("new");
  assert.match(cache.lowOf(5) ?? "", /new/u);
  assert.equal(cache.lowOf(6), undefined);
});

test("retain drops low bitmaps away from the pages on screen, and keeps one low bitmap per page", () => {
  const { cache, tasks, urls } = harness();
  for (let page = 0; page < 10; page++) {
    cache.request(
      { quality: "low", page: page, scale: 0.5, dpr: 1 },
      () => undefined,
    );
    tasks[page]!.done(`p${page}`);
  }
  cache.request(
    { quality: "low", page: 5, scale: 0.75, dpr: 1 },
    () => undefined,
  );
  tasks[10]!.done("p5b");
  cache.retain([4, 6], [5]);
  assert.deepEqual(cache.size(), { low: 3, full: 0 });
  assert.equal(urls.size, 3);
  assert.match(cache.lowOf(5) ?? "", /p5b/u, "the newer one stays");
});

test("only a few full bitmaps of pages that are not on screen are kept, the newest", () => {
  const { cache, tasks, urls } = harness();
  const count = KEPT_FULL_BITMAPS + 4;
  cache.retain(undefined, [0]);
  for (let page = 0; page < count; page++) {
    cache.request(
      { quality: "full", page: page, scale: 1, dpr: 1 },
      () => undefined,
    );
    tasks[page]!.done(`f${page}`);
  }
  cache.retain(undefined, [0]);
  const { full } = cache.size();
  assert.equal(
    full,
    KEPT_FULL_BITMAPS + 1,
    "the ones on screen are kept besides",
  );
  assert.equal(urls.size, full);
  assert.ok(
    cache.peek({ quality: "full", page: 0, scale: 1, dpr: 1 }),
    "on screen",
  );
  assert.ok(
    cache.peek({ quality: "full", page: count - 1, scale: 1, dpr: 1 }),
    "newest",
  );
  assert.equal(
    cache.peek({ quality: "full", page: 1, scale: 1, dpr: 1 }),
    undefined,
    "oldest idle one is gone",
  );
});

test("dispose revokes every URL and aborts every render", () => {
  const { cache, tasks, urls } = harness();
  cache.request(
    { quality: "full", page: 0, scale: 1, dpr: 1 },
    () => undefined,
  );
  tasks[0]!.done("a");
  cache.request(
    { quality: "full", page: 1, scale: 1, dpr: 1 },
    () => undefined,
  );
  cache.dispose();
  assert.equal(urls.size, 0);
  assert.equal(tasks[1]!.aborted, true);
});

test("the low scale is half the displayed one in steps of a quarter, within limits", () => {
  assert.equal(lowScale(1.0), 0.5);
  assert.equal(lowScale(0.4), 0.25);
  assert.equal(lowScale(4), 0.75);
  assert.equal(lowScale(1.7), 0.75);
  assert.equal(
    lowScale(1.1),
    0.5,
    "zoom steps close to each other share the bitmap",
  );
});

test("the prefetch range is the pages on screen and four either side, within the document", () => {
  assert.deepEqual(prefetchRange([4, 5], 15), [0, 9]);
  assert.deepEqual(prefetchRange([0], 15), [0, 4]);
  assert.deepEqual(prefetchRange([13, 14], 15), [9, 14]);
  assert.equal(prefetchRange([], 15), undefined);
});
