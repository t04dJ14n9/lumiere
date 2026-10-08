import test from "node:test";
import assert from "node:assert/strict";
import { defineProtocol, Schema } from "../../../src/kernel";
import { Endpoint, CancelToken } from "../../../src/shared/rpc/endpoint";
import type { Clock, Transport } from "../../../src/shared/rpc/endpoint";
const protocol = defineProtocol("example", {
  requests: { double: { params: Schema.number(), result: Schema.number() } },
  notifications: { changed: Schema.string() },
});
class FakeClock implements Clock {
  timers = new Map<() => void, number>();
  after(ms: number, callback: () => void) {
    this.timers.set(callback, ms);
    return () => {
      this.timers.delete(callback);
    };
  }
  expire() {
    for (const callback of [...this.timers.keys()]) callback();
  }
}
function pair() {
  const clock = new FakeClock(),
    logs: string[] = [],
    sent: unknown[] = [];
  let toA: (v: unknown) => void = () => {},
    toB: (v: unknown) => void = () => {};
  const aTransport: Transport = {
    send(v) {
      sent.push(v);
      toB(structuredClone(v));
    },
    listen(fn) {
      toA = fn;
      return () => {
        toA = () => {};
      };
    },
  };
  const bTransport: Transport = {
    send(v) {
      sent.push(v);
      toA(structuredClone(v));
    },
    listen(fn) {
      toB = fn;
      return () => {
        toB = () => {};
      };
    },
  };
  const logger = {
    debug() {},
    warn(m: string) {
      logs.push(m);
    },
    error(m: string) {
      logs.push(m);
    },
  };
  const a = new Endpoint(aTransport, clock, logger),
    b = new Endpoint(bTransport, clock, logger);
  return { a, b, clock, logs, sent, toA: (v: unknown) => toA(v), toB: (v: unknown) => toB(v) };
}
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
test("RPC namespaces methods, validates results, and unregistering disables a channel", async () => {
  const { a, b, clock } = pair();
  const stop = b.handle(protocol, "double", (n) => n * 2);
  assert.equal(await a.call(protocol, "double", 3), 6);
  assert.equal(clock.timers.size, 0);
  const other = defineProtocol("other", { requests: protocol.requests, notifications: {} });
  b.handle(other, "double", (n) => n * 3);
  assert.equal(await a.call(other, "double", 3), 9);
  assert.throws(() => b.handle(protocol, "double", (n) => n));
  await stop();
  await assert.rejects(a.call(protocol, "double", 1), { code: "PluginDisabled" });
  await a.dispose();
  await b.dispose();
});
test("RPC rejects invalid outbound params, drops malformed envelopes and inbound params", async () => {
  const { a, b, logs, sent, toB } = pair();
  let calls = 0;
  b.handle(protocol, "double", (n) => {
    calls++;
    return n;
  });
  await assert.rejects(a.call(protocol, "double", "bad" as unknown as number));
  assert.equal(sent.length, 0);
  for (const value of [
    null,
    { kind: "request", id: 1.1, channel: "example", method: "double", params: 1 },
    { kind: "__proto__" },
    { kind: "request", id: 1, channel: "example", method: "double", params: "bad" },
    { kind: "request", id: 1, channel: "example", method: "double", params: 1, extra: true },
  ])
    toB(value);
  await tick();
  assert.equal(calls, 0);
  assert.equal(logs.length, 5);
  assert.equal(sent.length, 0);
  await a.dispose();
  await b.dispose();
});
test("invalid handler results and forged response payloads reject callers", async () => {
  const { a, b, toA } = pair();
  const stop = b.handle(protocol, "double", () => "bad" as unknown as number);
  await assert.rejects(a.call(protocol, "double", 2), { code: "InvalidResult" });
  await stop();
  b.handle(protocol, "double", () => new Promise<number>(() => {}));
  const pending = a.call(protocol, "double", 1);
  toA({ kind: "response", id: 2, result: "bad" });
  await assert.rejects(pending, { code: "InvalidResult" });
  await a.dispose();
  await b.dispose();
});
test("notifications validate both directions and isolate listeners", async () => {
  const { a, b, toB } = pair();
  const seen: string[] = [];
  b.on(protocol, "changed", () => {
    throw new Error("listener");
  });
  const stop = b.on(protocol, "changed", (value) => {
    seen.push(value);
  });
  a.notify(protocol, "changed", "one");
  await tick();
  assert.deepEqual(seen, ["one"]);
  assert.throws(() => a.notify(protocol, "changed", 1 as unknown as string));
  toB({ kind: "notify", channel: "example", method: "changed", params: 1 });
  await tick();
  assert.deepEqual(seen, ["one"]);
  await stop();
  a.notify(protocol, "changed", "two");
  await tick();
  assert.deepEqual(seen, ["one"]);
  await a.dispose();
  await b.dispose();
});
test("timeout defaults to ten seconds, cancels remote work, and ignores a late result", async () => {
  const { a, b, clock } = pair();
  let cancelled = false,
    resolve!: (n: number) => void;
  b.handle(protocol, "double", (_n, token) => {
    token.onCancel(() => {
      cancelled = true;
    });
    return new Promise((r) => {
      resolve = r;
    });
  });
  const result = a.call(protocol, "double", 2);
  assert.deepEqual([...clock.timers.values()], [10000]);
  const rejected = assert.rejects(result, { code: "Timeout" });
  clock.expire();
  await rejected;
  assert.ok(cancelled);
  assert.equal(clock.timers.size, 0);
  resolve(4);
  await tick();
  await a.dispose();
  await b.dispose();
});
test("explicit cancellation and disposal reject requests and clean subscriptions", async () => {
  const { a, b, clock } = pair();
  let cancelled = 0;
  b.handle(protocol, "double", (_n, token) => {
    token.onCancel(() => {
      cancelled++;
    });
    return new Promise(() => {});
  });
  const token = new CancelToken(),
    result = a.call(protocol, "double", 2, { token });
  const rejected = assert.rejects(result, { code: "Cancelled" });
  token.cancel();
  await rejected;
  assert.equal(cancelled, 1);
  await assert.rejects(a.call(protocol, "double", 2, { token }), { code: "Cancelled" });
  const pending = a.call(protocol, "double", 3),
    disposed = assert.rejects(pending, { code: "Disposed" });
  await a.dispose();
  await disposed;
  await b.dispose();
  assert.equal(cancelled, 2);
  assert.equal(clock.timers.size, 0);
  await assert.rejects(a.call(protocol, "double", 1), { code: "Disposed" });
});
test("disabling a handler cancels in-flight work and rejects its caller", async () => {
  const { a, b } = pair();
  let cancelled = false;
  const stop = b.handle(protocol, "double", (_n, token) => {
    token.onCancel(() => {
      cancelled = true;
    });
    return new Promise(() => {});
  });
  const pending = a.call(protocol, "double", 1),
    rejected = assert.rejects(pending, { code: "PluginDisabled" });
  await stop();
  await rejected;
  assert.ok(cancelled);
  await a.dispose();
  await b.dispose();
});
