import test from "node:test";
import assert from "node:assert/strict";
import { Context } from "../../../src/kernel";
declare module "../../../src/kernel/types" {
  interface Events {
    /** @mode emit */ signal: (value: number) => void;
    /** @mode serial */ sequence: () => void | Promise<void>;
    /** @mode parallel */ concurrent: () => void | Promise<void>;
    /** @mode bail */ claim: () => string | undefined;
    /** @mode waterfall */ transform: (value: string) => string | Promise<string>;
  }
}
test("emit uses registration order, prepend, listener isolation, and effect cleanup", async () => {
  const root = Context.create(),
    order: number[] = [];
  const fiber = root.plugin({
    name: "events",
    apply(ctx) {
      ctx.on("signal", () => {
        throw new Error("listener");
      });
      ctx.on("signal", (n) => {
        order.push(n);
      });
      ctx.on(
        "signal",
        () => {
          order.push(0);
        },
        { prepend: true },
      );
    },
  });
  await root.settled();
  root.emit("signal", 1);
  assert.deepEqual(order, [0, 1]);
  await fiber.dispose();
  root.emit("signal", 2);
  assert.deepEqual(order, [0, 1]);
  await root.dispose();
});
test("serial awaits listeners; parallel starts all before awaiting", async () => {
  const root = Context.create(),
    order: string[] = [];
  root.on("sequence", async () => {
    await Promise.resolve();
    order.push("a");
  });
  root.on("sequence", async () => {
    throw new Error("skip");
  });
  root.on("sequence", () => {
    order.push("b");
  });
  await root.serial("sequence");
  assert.deepEqual(order, ["a", "b"]);
  root.on("concurrent", async () => {
    order.push("start");
    await Promise.resolve();
    order.push("end");
  });
  root.on("concurrent", () => {
    order.push("parallel");
  });
  await root.parallel("concurrent");
  assert.deepEqual(order.slice(2), ["start", "parallel", "end"]);
  await root.dispose();
});
test("bail skips throwing listeners and stops at first non-undefined; waterfall awaits transformations", async () => {
  const root = Context.create();
  let late = false;
  root.on("claim", () => {
    throw new Error("skip");
  });
  root.on("claim", () => undefined);
  root.on("claim", () => "claimed");
  root.on("claim", () => {
    late = true;
    return "late";
  });
  assert.equal(root.bail("claim"), "claimed");
  assert.equal(late, false);
  root.on("transform", async (v) => v + "a");
  root.on("transform", () => {
    throw new Error("skip");
  });
  root.on("transform", (v) => v + "b");
  assert.equal(await root.waterfall("transform", ""), "ab");
  await root.dispose();
});
