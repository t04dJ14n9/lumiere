import assert from "node:assert/strict";
import { test } from "node:test";
import { deliverNativeLocation } from "../../src/extension/plugins/pdf/native-delivery";
import type { LinkRun } from "../../src/extension/plugins/pdf/source-links";
import type { HistorySnapshot } from "../../src/shared/pdf-history";

function context() {
  const cancellations = new WeakMap<LinkRun, () => void>();
  let cancelled = false;
  const run: LinkRun = {
    current: () => !cancelled,
    cancel: () => {
      cancelled = true;
      cancellations.get(run)?.();
    },
  };
  return { run, cancellations };
}
const captured: HistorySnapshot = {
  intent: 17,
  position: {
    page: 1,
    top: 0,
    left: 0,
    zoom: 100,
    pageLayout: "single",
    scrollMode: "continuous",
    scrollDirection: "vertical",
  },
};

test("leaving a cold PDF before bytes arrive never queues a late location", async () => {
  const { run, cancellations } = context();
  let loaded = false;
  let delivered = 0;
  const panel = {
    prepareLocation: () =>
      loaded ? { requestId: 1, done: Promise.resolve(captured) } : undefined,
    revealLocation: () => {
      delivered++;
      return { requestId: 2, done: Promise.resolve(true) };
    },
    cancelNavigation: () => {},
  };
  const pending = deliverNativeLocation(panel, { page: 9 }, run, cancellations);
  run.cancel();
  loaded = true;
  await pending;
  assert.equal(delivered, 0);
  assert.equal(cancellations.has(run), false);
});

test("native delivery stays pending through exact-request renderer acknowledgement", async () => {
  const { run, cancellations } = context();
  let finish!: (ok: boolean) => void;
  const result = new Promise<boolean>((resolve) => {
    finish = resolve;
  });
  let sent!: () => void;
  const dispatch = new Promise<void>((resolve) => {
    sent = resolve;
  });
  const canceled: number[] = [];
  const panel = {
    prepareLocation: () => ({ requestId: 1, done: Promise.resolve(captured) }),
    revealLocation: (_location: unknown, expected: number) => {
      assert.equal(expected, 17);
      sent();
      return { requestId: 2, done: result };
    },
    cancelNavigation: (id: number) => {
      canceled.push(id);
      finish(false);
    },
  };
  let completed = false;
  const pending = deliverNativeLocation(
    panel,
    { page: 9 },
    run,
    cancellations,
  ).then(() => {
    completed = true;
  });
  await dispatch;
  assert.equal(completed, false);
  run.cancel();
  await pending;
  assert.deepEqual(canceled, [2]);
  assert.equal(cancellations.has(run), false);
});

test("an acknowledged delivery releases its cancellation callback", async () => {
  const { run, cancellations } = context();
  const panel = {
    prepareLocation: () => ({ requestId: 1, done: Promise.resolve(captured) }),
    revealLocation: () => ({ requestId: 2, done: Promise.resolve(true) }),
    cancelNavigation: () => {
      assert.fail("completed request must not cancel a later reader action");
    },
  };
  await deliverNativeLocation(panel, { page: 9 }, run, cancellations);
  run.cancel();
});

for (const stage of ["capture", "delivery"] as const) {
  test(`a rejected ${stage} retires the run without cancelling newer reader navigation`, async () => {
    const { run, cancellations } = context();
    const panel = {
      prepareLocation: () => ({
        requestId: 1,
        done: Promise.resolve(stage === "capture" ? undefined : captured),
      }),
      revealLocation: () => ({ requestId: 2, done: Promise.resolve(false) }),
      cancelNavigation: () => {
        assert.fail("a completed rejection must not cancel newer reader input");
      },
    };
    await deliverNativeLocation(panel, { page: 9 }, run, cancellations);
    assert.equal(run.current(), false);
    assert.equal(cancellations.has(run), false);
  });
}
