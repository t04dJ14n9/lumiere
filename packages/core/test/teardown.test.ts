import test from "node:test";
import assert from "node:assert/strict";
import { createRoot } from "@workshop/core";

declare module "@workshop/core" {
  interface Services {
    "teardown.first": { read(): string };
    "teardown.second": { read(): string };
  }
}

/** A promise settled by hand, so ordering never depends on timers. */
function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, opened };
}

const errorsOf = () => {
  const errors: string[] = [];
  const logger = {
    debug() {},
    warn() {},
    error: (message: string) => void errors.push(message),
  };
  return { errors, logger };
};

test("a provider waits for a consumer already stopping before releasing its backing", async () => {
  const root = createRoot();
  const order: string[] = [];
  const consumerStop = gate();
  const provider = root.plugin({
    name: "provider",
    provides: ["teardown.first"],
    apply(ctx) {
      ctx.provide("teardown.first", { read: () => "first" });
      ctx.effect(() => () => void order.push("provider released"));
    },
  });
  const consumer = root.plugin({
    name: "consumer",
    inject: { required: ["teardown.first"] },
    apply(ctx) {
      ctx.effect(() => async () => {
        await consumerStop.opened;
        order.push("consumer stopped");
      });
    },
  });
  await root.settled();
  assert.equal(consumer.state, "active");
  // The consumer starts stopping on its own (a disable) and stalls.
  const consumerDisposed = consumer.dispose();
  const providerDisposed = provider.dispose();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(order, [], "provider released while its consumer stops");
  consumerStop.open();
  await Promise.all([consumerDisposed, providerDisposed]);
  assert.deepEqual(order, ["consumer stopped", "provider released"]);
  await root.dispose();
  assert.deepEqual(root.ledger.snapshot(), {});
});

test("two providers lost together both wait for their shared consumer", async () => {
  const root = createRoot();
  const order: string[] = [];
  const consumerStop = gate();
  const providers = (["teardown.first", "teardown.second"] as const).map(
    (name) =>
      root.plugin({
        name,
        provides: [name],
        apply(ctx) {
          ctx.provide(name, { read: () => name });
          ctx.effect(() => () => void order.push(`${name} released`));
        },
      }),
  );
  root.plugin({
    name: "consumer",
    inject: { required: ["teardown.first", "teardown.second"] },
    apply(ctx) {
      ctx.effect(() => async () => {
        await consumerStop.opened;
        order.push("consumer stopped");
      });
    },
  });
  await root.settled();
  const disposed = Promise.all(providers.map((fiber) => fiber.dispose()));
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(order, [], "a provider released while the consumer stops");
  consumerStop.open();
  await disposed;
  assert.equal(order[0], "consumer stopped");
  assert.equal(order.length, 3);
  await root.dispose();
});

test("concurrent disposals of a context both wait for the whole teardown", async () => {
  const root = createRoot();
  const release = gate();
  let released = false;
  root.effect(() => async () => {
    await release.opened;
    released = true;
  });
  let settled = 0;
  const first = root.dispose().then(() => settled++);
  const second = root.dispose().then(() => settled++);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(settled, 0, "a second dispose returned before teardown ended");
  release.open();
  await Promise.all([first, second]);
  assert.equal(released, true);
  assert.equal(settled, 2);
});

test("a failed cleanup leaves evidence in the ledger instead of a clean snapshot", async () => {
  const { errors, logger } = errorsOf();
  const root = createRoot({ logger });
  const fiber = root.plugin({
    name: "broken",
    apply(ctx) {
      ctx.effect(() => () => {
        throw new Error("cleanup failed");
      });
    },
  });
  await root.settled();
  await fiber.dispose();
  assert.deepEqual(root.ledger.snapshot(), {
    broken: { "failed effect": 1 },
  });
  assert.deepEqual(errors, ["[broken] Disposal failed"]);
  await root.dispose();
});

test("a resource stays in the ledger until its cleanup has finished", async () => {
  const root = createRoot();
  const release = gate();
  const stop = root.effect(() => () => release.opened);
  const stopped = stop();
  assert.deepEqual(root.ledger.snapshot(), { root: { effect: 1 } });
  // A second release joins the first rather than reporting it done.
  let joined = false;
  const again = Promise.resolve(stop()).then(() => (joined = true));
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(joined, false);
  release.open();
  await Promise.all([stopped, again]);
  assert.deepEqual(root.ledger.snapshot(), {});
  await root.dispose();
});

test("a rejected tracked job is logged, settled() still resolves, and nothing is unhandled", async () => {
  const unhandled: unknown[] = [];
  const record = (reason: unknown) => void unhandled.push(reason);
  process.on("unhandledRejection", record);
  try {
    const { errors, logger } = errorsOf();
    const root = createRoot({ logger });
    root.track(Promise.reject(new Error("job failed")));
    await root.settled();
    assert.deepEqual(errors, ["[root] Tracked work failed"]);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(unhandled, []);
  } finally {
    process.off("unhandledRejection", record);
  }
});

for (const outcome of ["resolves", "rejects"] as const) {
  test(`dispose waits for a release started before it (the inverse ${outcome})`, async () => {
    const { errors, logger } = errorsOf();
    const root = createRoot({ logger });
    const release = gate();
    const stop = root.effect(() => async () => {
      await release.opened;
      if (outcome === "rejects") {
        throw new Error("cleanup failed");
      }
    });
    const early = Promise.resolve(stop()).then(
      () => "released",
      () => "failed",
    );
    let disposed = false;
    const disposal = root.dispose().then(() => (disposed = true));
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(disposed, false, "dispose finished before an earlier release");
    release.open();
    await disposal;
    assert.equal(await early, outcome === "resolves" ? "released" : "failed");
    // The early caller got the error; teardown does not log it again.
    assert.deepEqual(errors, []);
    assert.deepEqual(
      root.ledger.snapshot(),
      outcome === "resolves" ? {} : { root: { "failed effect": 1 } },
    );
  });
}
