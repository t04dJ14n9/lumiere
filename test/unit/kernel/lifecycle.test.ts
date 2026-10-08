import test from "node:test";
import assert from "node:assert/strict";
import { Context, Schema, Service } from "../../../src/kernel";
import type { Logger } from "../../../src/kernel";
declare module "../../../src/kernel/types" {
  interface Services {
    value: number;
    replacement: number;
    asynchronous: AsyncService;
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
class AsyncService extends Service {
  constructor(ctx: Context) {
    super(ctx, "asynchronous", undefined);
  }
  protected override async start() {
    await tick();
  }
}
test("required services gate, withdraw, and resume independent of load order", async () => {
  const root = Context.create();
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
    apply(ctx) {
      ctx.provide("value", 2);
    },
  });
  await root.settled();
  assert.deepEqual(seen, [1, 2]);
  await root.dispose();
});
test("effects are LIFO, then children, then provided services withdraw; disposal errors are isolated", async () => {
  const order: string[] = [],
    root = Context.create();
  const parent = root.plugin({
    name: "parent",
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
  assert.deepEqual(order, ["second", "first", "child", "dependent"]);
  assert.equal(dependent.state, "pending");
  await root.dispose();
});
test("duplicate providers fail without affecting consumers; replacement stacks restore the prior provider", async () => {
  const root = Context.create({ replaceable: ["replacement"] });
  root.plugin({
    name: "first",
    apply(ctx) {
      ctx.provide("value", 1);
      ctx.provide("replacement", 10);
    },
  });
  await root.settled();
  const duplicate = root.plugin({
    name: "duplicate",
    apply(ctx) {
      ctx.provide("value", 2);
    },
  });
  const seen: number[] = [];
  root.plugin({
    name: "consumer",
    inject: { required: ["replacement"] },
    apply(ctx) {
      seen.push(ctx.replacement);
    },
  });
  await root.settled();
  assert.equal(duplicate.state, "failed");
  const replacement = root.plugin({
    name: "replacement",
    apply(ctx) {
      ctx.provide("replacement", 20);
    },
  });
  await root.settled();
  await replacement.dispose();
  await root.settled();
  assert.deepEqual(seen, [10, 20, 10]);
  await root.dispose();
});
test("undeclared services throw; optional injection is allowed and refreshes on availability", async () => {
  const root = Context.create(),
    seen: (number | undefined)[] = [];
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
    apply(ctx) {
      ctx.provide("value", 3);
    },
  });
  await root.settled();
  assert.deepEqual(seen, [undefined, 3]);
  await root.dispose();
});
test("update reconfigures or restarts with validated config; failed apply retries and rolls back", async () => {
  const root = Context.create();
  let runs = 0,
    cleanups = 0,
    config = 0;
  const plugin = root.plugin(
    {
      name: "config",
      config: Schema.number().min(0),
      apply(ctx, value) {
        runs++;
        ctx.effect(() => () => {
          cleanups++;
        });
        if (value === 0) throw new Error("bad value");
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
  const root = Context.create();
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
  const root = Context.create(),
    gate = deferred();
  let lateSetup = false;
  const fiber = root.plugin({
    name: "slow",
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
  assert.equal(root.runtime.value("value"), undefined);
  await root.dispose();
});
test("Service class publishes only after async start and is withdrawn on stop", async () => {
  const root = Context.create(),
    fiber = root.plugin(AsyncService);
  assert.equal(root.runtime.value("asynchronous"), undefined);
  await root.settled();
  assert.ok(root.runtime.value("asynchronous") instanceof AsyncService);
  await fiber.dispose();
  assert.equal(root.runtime.value("asynchronous"), undefined);
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
  const root = Context.create({ logger });
  root.plugin({ name: "timed", apply() {} });
  await root.settled();
  await root.dispose();
  assert.deepEqual(logs, ["[timed] Loaded", "[timed] Stopped"]);
});
test("service withdrawal during loading invalidates the old activation and gates before restarting", async () => {
  const root = Context.create(),
    gate = deferred();
  let runs = 0,
    cleanups = 0;
  const provider = root.plugin({
    name: "provider",
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
      if (runs === 1) await gate.promise;
    },
  });
  await provider.dispose();
  await tick();
  assert.equal(consumer.state, "pending");
  assert.equal(cleanups, 1);
  root.plugin({
    name: "provider2",
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
  const root = Context.create();
  assert.equal(await Promise.resolve(root), root);
  const fiber = root.plugin({ name: "plain", apply() {} });
  await root.settled();
  assert.equal(await Promise.resolve(fiber.context), fiber.context);
  await root.dispose();
});
