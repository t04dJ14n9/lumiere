import test from "node:test";
import assert from "node:assert/strict";
import { Context, bindCaller } from "../../../src/kernel";
import type { CallerBound, Plugin } from "../../../src/kernel";

declare module "../../../src/kernel/types" {
  interface Services {
    traced: { owner: string } & Partial<CallerBound<{ owner: string }>>;
  }
  interface Events {
    /** @mode waterfall */ ranked: (value: string) => string;
  }
}

test("caller-bound reads cache per context and refresh across provider replacement", async () => {
  const root = Context.create({ replaceable: ["traced"] });
  const calls: Context[] = [];
  const service = (prefix: string) => ({
    owner: "provider",
    [bindCaller](caller: Context) {
      calls.push(caller);
      return { owner: prefix + caller.fiber!.definition.name };
    },
  });
  root.provide("traced", service("one:"));
  const seen: string[] = [];
  const consumer = (name: string): Plugin => ({
    name,
    inject: { required: ["traced"] },
    apply(ctx) {
      assert.equal(ctx.traced, ctx.traced);
      seen.push(ctx.traced.owner);
    },
  });
  root.plugin(consumer("a"));
  root.plugin(consumer("b"));
  await root.settled();
  assert.deepEqual(seen, ["one:a", "one:b"]);
  assert.equal(calls.length, 2);
  assert.notEqual(calls[0], calls[1]);
  const replacement = root.plugin({
    name: "replacement",
    apply(ctx) {
      ctx.provide("traced", service("two:"));
    },
  });
  await root.settled();
  assert.deepEqual(seen.slice(2), ["two:a", "two:b"]);
  await replacement.dispose();
  await root.settled();
  assert.deepEqual(seen.slice(4), ["one:a", "one:b"]);
  assert.equal(calls.length, 6);
  await root.dispose();
});

test("event slots and owner rank survive reversed loading, update and toggles", async () => {
  const root = Context.create({ rank: (id) => ({ a: 0, b: 1 })[id] ?? 2 });
  const plugin = (name: string): Plugin => ({
    name,
    apply(ctx) {
      ctx.on("ranked", (v) => v + name + "1");
      ctx.on("ranked", (v) => v + name + "2");
      ctx.on("ranked", (v) => v + name + "P", { prepend: true });
    },
  });
  root.plugin(plugin("b"));
  let a = root.plugin(plugin("a"));
  await root.settled();
  const expected = "aPbPa1a2b1b2";
  assert.equal(await root.waterfall("ranked", ""), expected);
  await a.update(undefined);
  await root.settled();
  assert.equal(await root.waterfall("ranked", ""), expected);
  await a.dispose();
  a = root.plugin(plugin("a"));
  await root.settled();
  assert.equal(await root.waterfall("ranked", ""), expected);
  await root.dispose();
});
