import test from "node:test";
import assert from "node:assert/strict";
import { Context } from "../../../src/kernel";

declare module "../../../src/kernel/types" {
  interface Services {
    backed: { read(): string };
  }
  interface Events {
    "transaction/ping": () => void;
  }
}

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test("a failing apply rolls back everything it acquired and never starts its children", async () => {
  const root = Context.create();
  let childStarted = false;
  let released = 0;
  const failing = root.plugin({
    name: "failing",
    apply(ctx) {
      ctx.effect(() => () => {
        released++;
      });
      ctx.acquire("registration", {
        dispose() {
          released++;
        },
      });
      ctx.provide("backed", { read: () => "never" });
      ctx.plugin({
        name: "child",
        apply() {
          childStarted = true;
        },
      });
      throw new Error("boom");
    },
  });
  await root.settled();
  assert.equal(failing.state, "failed");
  assert.equal(childStarted, false);
  assert.equal(released, 2);
  assert.equal(root.runtime.value("backed"), undefined);
  assert.deepEqual(root.runtime.ledger.snapshot(), { root: { fiber: 1 } });
  await root.dispose();
  assert.deepEqual(root.runtime.ledger.snapshot(), {});
});

test("an async apply publishes its services and starts its children only on commit", async () => {
  const root = Context.create();
  let resolve!: () => void;
  const gate = new Promise<void>((r) => {
    resolve = r;
  });
  let childStarted = false;
  root.plugin({
    name: "slow",
    async apply(ctx) {
      ctx.provide("backed", { read: () => "ready" });
      ctx.plugin({
        name: "child",
        apply() {
          childStarted = true;
        },
      });
      await gate;
    },
  });
  await tick();
  assert.equal(root.runtime.value("backed"), undefined);
  assert.equal(childStarted, false);
  resolve();
  await root.settled();
  assert.equal(childStarted, true);
  assert.ok(root.runtime.value("backed"));
  await root.dispose();
});

test("consumers finish stopping before the resource backing a service is released", async () => {
  const root = Context.create();
  const order: string[] = [];
  let open = false;
  const provider = root.plugin({
    name: "provider",
    apply(ctx) {
      ctx.effect(() => {
        open = true;
        return () => {
          open = false;
          order.push("resource closed");
        };
      });
      ctx.provide("backed", {
        read: () => {
          if (!open) {
            throw new Error("read after close");
          }
          return "ok";
        },
      });
    },
  });
  root.plugin({
    name: "consumer",
    inject: { required: ["backed"] },
    apply(ctx) {
      const backed = ctx.backed;
      ctx.effect(() => async () => {
        await tick();
        order.push(`consumer flushed ${backed.read()}`);
      });
    },
  });
  await root.settled();
  await provider.dispose();
  await root.settled();
  assert.deepEqual(order, ["consumer flushed ok", "resource closed"]);
  await root.dispose();
});

test("the ledger names what each plugin holds and is empty after disposal", async () => {
  const root = Context.create();
  const fiber = root.plugin({
    name: "holder",
    apply(ctx) {
      ctx.effect(() => () => {});
      ctx.on("transaction/ping", () => {});
      ctx.acquire("watcher", { dispose() {} });
      ctx.provide("backed", { read: () => "x" });
    },
  });
  await root.settled();
  assert.deepEqual(root.runtime.ledger.snapshot().holder, {
    effect: 1,
    listener: 1,
    watcher: 1,
    service: 1,
  });
  await fiber.dispose();
  assert.equal(root.runtime.ledger.snapshot().holder, undefined);
  await root.dispose();
  assert.deepEqual(root.runtime.ledger.snapshot(), {});
});

test("a resource handed to a disposed context is released at once", async () => {
  const root = Context.create();
  let ctxRef: Context | undefined;
  const fiber = root.plugin({
    name: "late",
    apply(ctx) {
      ctxRef = ctx;
    },
  });
  await root.settled();
  await fiber.dispose();
  let released = false;
  assert.throws(() =>
    ctxRef!.acquire("socket", {
      dispose() {
        released = true;
      },
    }),
  );
  assert.equal(released, true);
  await root.dispose();
});
