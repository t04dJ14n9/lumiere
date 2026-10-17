import test from "node:test";
import assert from "node:assert/strict";
import { createRoot, Schema } from "@workshop/core";
import type { Logger } from "@workshop/core";
declare module "@workshop/core" {
  interface Services {
    value: number;
    replacement: number;
  }
}
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

test("parent disposal joins a child that detached while its cleanup is still running", async () => {
  const root = createRoot();
  const entered = deferred();
  const finish = deferred();
  let released = 0;
  const child = root.plugin({
    name: "detaching-child",
    apply(ctx) {
      ctx.effect(() => async () => {
        entered.resolve();
        await finish.promise;
        released++;
      });
    },
  });
  await root.settled();
  const childStop = child.dispose();
  await entered.promise;
  let parentStopped = false;
  const parentStop = root.dispose().then(() => {
    parentStopped = true;
  });
  try {
    await tick();
    assert.equal(parentStopped, false);
    assert.equal(released, 0);
  } finally {
    finish.resolve();
    await Promise.all([childStop, parentStop]);
  }
  assert.equal(released, 1);
  assert.deepEqual(root.ledger.snapshot(), {});
});
test("required services gate, withdraw, and resume independent of load order", async () => {
  const root = createRoot();
  const seen: number[] = [];
  const consumer = root.plugin({
    name: "consumer",
    inject: { required: ["value"] },
    apply(ctx) {
      seen.push(ctx.value);
    },
  });
  assert.equal(consumer.state, "pending");
  assert.deepEqual(consumer.waitingFor, ["value"]);
  const provider = root.plugin({
    name: "provider",
    provides: ["value"],
    apply(ctx) {
      ctx.provide("value", 1);
    },
  });
  await root.settled();
  assert.equal(consumer.state, "active");
  assert.deepEqual(seen, [1]);
  await provider.dispose();
  await root.settled();
  assert.equal(consumer.state, "pending");
  root.plugin({
    name: "replacement",
    provides: ["value"],
    apply(ctx) {
      ctx.provide("value", 2);
    },
  });
  await root.settled();
  assert.deepEqual(seen, [1, 2]);
  await root.dispose();
});
test("teardown mirrors activation: services withdraw and consumers stop first, then effects and children LIFO; disposal errors are isolated", async () => {
  const order: string[] = [];
  const root = createRoot();
  const parent = root.plugin({
    name: "parent",
    provides: ["value"],
    apply(ctx) {
      ctx.provide("value", 7);
      ctx.effect(() => () => {
        order.push("first");
      });
      ctx.effect(() => () => {
        order.push("second");
        throw new Error("cleanup");
      });
      ctx.plugin({
        name: "child",
        apply(child) {
          child.effect(() => () => {
            order.push("child");
          });
        },
      });
    },
  });
  const dependent = root.plugin({
    name: "dependent",
    inject: { required: ["value"] },
    apply(ctx) {
      ctx.effect(() => () => {
        order.push("dependent");
      });
    },
  });
  await root.settled();
  await parent.dispose();
  await root.settled();
  assert.deepEqual(order, ["dependent", "child", "second", "first"]);
  assert.equal(dependent.state, "pending");
  await root.dispose();
});
test("a duplicate provider fails without affecting the first provider's consumers", async () => {
  const root = createRoot();
  root.plugin({
    name: "first",
    provides: ["value"],
    apply(ctx) {
      ctx.provide("value", 1);
    },
  });
  await root.settled();
  const duplicate = root.plugin({
    name: "duplicate",
    provides: ["value"],
    apply(ctx) {
      ctx.provide("value", 2);
    },
  });
  const seen: number[] = [];
  root.plugin({
    name: "consumer",
    inject: { required: ["value"] },
    apply(ctx) {
      seen.push(ctx.value);
    },
  });
  await root.settled();
  assert.equal(duplicate.state, "failed");
  assert.deepEqual(seen, [1]);
  await root.dispose();
});
test("undeclared services throw; optional injection is allowed and refreshes on availability", async () => {
  const root = createRoot();
  const seen: (number | undefined)[] = [];
  const bad = root.plugin({
    name: "bad",
    apply(ctx) {
      void ctx.value;
    },
  });
  root.plugin({
    name: "optional",
    inject: { optional: ["value"] },
    apply(ctx) {
      seen.push(ctx.value);
    },
  });
  await root.settled();
  assert.equal(bad.state, "failed");
  assert.match(String((bad.error as Error).cause), /did not inject value/);
  root.plugin({
    name: "provider",
    provides: ["value"],
    apply(ctx) {
      ctx.provide("value", 3);
    },
  });
  await root.settled();
  assert.deepEqual(seen, [undefined, 3]);
  await root.dispose();
});
test("update reconfigures or restarts with validated config; failed apply retries and rolls back", async () => {
  const root = createRoot();
  let runs = 0;
  let cleanups = 0;
  let config = 0;
  const plugin = root.plugin(
    {
      name: "config",
      config: Schema.number().min(0),
      apply(ctx, value) {
        runs++;
        ctx.effect(() => () => {
          cleanups++;
        });
        if (value === 0) {
          throw new Error("bad value");
        }
        config = value;
      },
      reconfigure(_ctx, value) {
        if (value === 2) {
          config = value;
          return true;
        }
        return false;
      },
    },
    0,
  );
  await root.settled();
  assert.equal(plugin.state, "failed");
  assert.equal(cleanups, 1);
  await plugin.update(1);
  await root.settled();
  assert.equal(plugin.state, "active");
  await plugin.update(2);
  assert.equal(config, 2);
  assert.equal(runs, 2);
  await plugin.update(3);
  await root.settled();
  assert.equal(runs, 3);
  assert.equal(cleanups, 2);
  await assert.rejects(plugin.update(-1));
  assert.equal(plugin.state, "active");
  await root.dispose();
  assert.equal(cleanups, 3);
  await assert.rejects(plugin.update(1), /config/);
});
test("async failure rolls back effects and does not fail siblings", async () => {
  const root = createRoot();
  let cleaned = false;
  const failing = root.plugin({
    name: "async",
    async apply(ctx) {
      ctx.effect(() => () => {
        cleaned = true;
      });
      await tick();
      throw new Error("async");
    },
  });
  const good = root.plugin({ name: "good", apply() {} });
  await root.settled();
  assert.equal(failing.state, "failed");
  assert.ok(cleaned);
  assert.equal(good.state, "active");
  await root.dispose();
});
test("disposal during async apply rejects late effects and never publishes a service", async () => {
  const root = createRoot();
  const gate = deferred();
  let lateSetup = false;
  const fiber = root.plugin({
    name: "slow",
    provides: ["value"],
    async apply(ctx) {
      await gate.promise;
      ctx.effect(() => {
        lateSetup = true;
        return () => {};
      });
      ctx.provide("value", 1);
    },
  });
  await fiber.dispose();
  gate.resolve();
  await root.settled();
  assert.equal(fiber.state, "disposed");
  assert.equal(lateSetup, false);
  assert.equal(root.service("value"), undefined);
  await root.dispose();
});
test("logs identify plugin and record load and stop timings", async () => {
  const logs: string[] = [];
  const logger: Logger = {
    debug(m) {
      logs.push(m);
    },
    warn() {},
    error() {},
  };
  const root = createRoot({ logger });
  root.plugin({ name: "timed", apply() {} });
  await root.settled();
  await root.dispose();
  assert.deepEqual(logs, ["[timed] Loaded", "[timed] Stopped"]);
});
test("service withdrawal during loading invalidates the old activation and gates before restarting", async () => {
  const root = createRoot();
  const gate = deferred();
  let runs = 0;
  let cleanups = 0;
  const provider = root.plugin({
    name: "provider",
    provides: ["value"],
    apply(ctx) {
      ctx.provide("value", 1);
    },
  });
  await root.settled();
  const consumer = root.plugin({
    name: "slow consumer",
    inject: { required: ["value"] },
    async apply(ctx) {
      runs++;
      ctx.effect(() => () => {
        cleanups++;
      });
      if (runs === 1) {
        await gate.promise;
      }
    },
  });
  // Let the consumer's first apply start and block on the gate.
  await tick();
  assert.equal(consumer.state, "loading");
  assert.equal(runs, 1);
  await provider.dispose();
  await tick();
  assert.equal(consumer.state, "pending");
  assert.equal(cleanups, 1);
  root.plugin({
    name: "provider2",
    provides: ["value"],
    apply(ctx) {
      ctx.provide("value", 2);
    },
  });
  gate.resolve();
  await root.settled();
  assert.equal(consumer.state, "active");
  assert.equal(runs, 2);
  await root.dispose();
  assert.equal(cleanups, 2);
});
test("contexts can cross async boundaries without being mistaken for thenables", async () => {
  const root = createRoot();
  assert.equal(await Promise.resolve(root), root);
  const fiber = root.plugin({ name: "plain", apply() {} });
  await root.settled();
  assert.equal(await Promise.resolve(fiber.context), fiber.context);
  await root.dispose();
});

test("effects undone early and child fibers disposed on their own are forgotten", async () => {
  const ctx = createRoot();
  const undone: string[] = [];
  for (let i = 0; i < 100; i++) {
    const dispose = ctx.effect(() => () => {
      undone.push(`early ${i}`);
    });
    await dispose();
  }
  ctx.effect(() => () => {
    undone.push("last");
  });
  // A long-lived context holds only what is still live.
  assert.deepEqual(ctx.ledger.snapshot(), { root: { effect: 1 } });
  for (let i = 0; i < 100; i++) {
    await ctx.plugin({ name: `child${i}`, apply() {} }).dispose();
  }
  ctx.plugin({ name: "kept", apply() {} });
  await ctx.settled();
  assert.deepEqual(ctx.ledger.snapshot(), { root: { effect: 1, plugin: 1 } });
  await ctx.dispose();
  assert.equal(undone.length, 101);
  assert.equal(undone.at(-1), "last");
});

test("a plugin publishes only the services it declares", async () => {
  const root = createRoot();
  const declared = root.plugin({
    name: "declared",
    provides: ["value"],
    apply(ctx) {
      ctx.provide("value", 1);
    },
  });
  const overreaching = root.plugin({
    name: "overreaching",
    provides: ["value"],
    apply(ctx) {
      ctx.provide("replacement", 2);
    },
  });
  const silent = root.plugin({
    name: "silent",
    apply(ctx) {
      ctx.provide("other", 3);
    },
  });
  await root.settled();
  assert.equal(declared.state, "active");
  assert.equal(overreaching.state, "failed");
  assert.match(String(overreaching.error), /without declaring it/);
  assert.equal(root.service("replacement"), undefined);
  assert.equal(silent.state, "failed");
  assert.equal(root.service("other"), undefined);
  await root.dispose();
});
