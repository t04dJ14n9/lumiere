import test from "node:test";
import assert from "node:assert/strict";
import { bindCaller, createRoot } from "@workshop/core";
import type { Context, CallerBound, Plugin } from "@workshop/core";

declare module "@workshop/core" {
  interface Services {
    traced: { owner: string } & Partial<CallerBound<{ owner: string }>>;
  }
  interface Events {
    /** @mode pipeline */ ranked: (value: string) => string;
  }
}

test("caller-bound reads cache per context and refresh across provider replacement", async () => {
  const root = createRoot();
  const calls: Context[] = [];
  const service = (prefix: string) => ({
    owner: "provider",
    [bindCaller](caller: Context) {
      calls.push(caller);
      return { owner: prefix + caller.owner };
    },
  });
  const original = root.plugin({
    name: "original",
    provides: ["traced"],
    apply(ctx) {
      ctx.provide("traced", service("one:"));
    },
  });
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
  await original.dispose();
  root.plugin({
    name: "replacement",
    provides: ["traced"],
    apply(ctx) {
      ctx.provide("traced", service("two:"));
    },
  });
  await root.settled();
  assert.deepEqual(seen.slice(2), ["two:a", "two:b"]);
  assert.equal(calls.length, 4);
  await root.dispose();
});

test("event slots and owner rank survive reversed loading, update and toggles", async () => {
  const root = createRoot({ rank: (id) => ({ a: 0, b: 1 })[id] ?? 2 });
  const plugin = (name: string): Plugin => ({
    name,
    apply(ctx) {
      ctx.on("ranked", (v) => v + name + "1");
      ctx.on("ranked", (v) => v + name + "2");
      ctx.on("ranked", (v) => v + name + "P", { prepend: true });
    },
  });
  root.plugin(plugin("b"));
  const a = root.plugin(plugin("a"));
  await root.settled();
  const expected = "aPbPa1a2b1b2";
  assert.equal(await root.pipeline("ranked", ""), expected);
  await a.update(undefined);
  await root.settled();
  assert.equal(await root.pipeline("ranked", ""), expected);
  await a.dispose();
  root.plugin(plugin("a"));
  await root.settled();
  assert.equal(await root.pipeline("ranked", ""), expected);
  await root.dispose();
});

test("equal-rank event owners keep lexical order across restart", async () => {
  const root = createRoot();
  const plugin = (name: string): Plugin => ({
    name,
    apply(ctx) {
      ctx.on("ranked", (value) => value + name);
    },
  });
  const last = root.plugin(plugin("z"));
  root.plugin(plugin("a"));
  await root.settled();
  assert.equal(await root.pipeline("ranked", ""), "az");
  await last.update(undefined);
  await root.settled();
  assert.equal(await root.pipeline("ranked", ""), "az");
  await root.dispose();
});
