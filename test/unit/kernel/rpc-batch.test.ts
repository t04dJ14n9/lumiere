import assert from "node:assert/strict";
import test from "node:test";
import { defineProtocol, Schema } from "../../../src/kernel";
import { Endpoint } from "../../../src/shared/rpc/endpoint";
import { parseEnvelope } from "../../../src/shared/rpc/envelope";

const protocol = defineProtocol("batching", {
  requests: { read: { params: Schema.number(), result: Schema.string() } },
  notifications: {
    selection: Schema.number(),
    markers: Schema.string(),
    log: Schema.string(),
  },
});

const clock = { after: () => () => {} };

function pair() {
  const sent: { kind: string; [key: string]: unknown }[] = [];
  const warnings: string[] = [];
  let toB: (value: unknown) => void = () => {};
  const a = new Endpoint(
    {
      send(value) {
        sent.push(value as { kind: string });
        toB(structuredClone(value));
      },
      listen: () => () => {},
    },
    clock,
  );
  const b = new Endpoint(
    {
      send() {},
      listen(receive) {
        toB = receive;
        return () => {};
      },
    },
    clock,
    {
      debug() {},
      warn: (message: string) => warnings.push(message),
      error() {},
    },
  );
  return { a, b, sent, warnings, receive: (value: unknown) => toB(value) };
}

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test("coalesced notifications leave as one versioned batch, latest value per method, first place kept", async () => {
  const { a, b, sent } = pair();
  const seen: string[] = [];
  b.on(protocol, "selection", (value) => void seen.push(`selection ${value}`));
  b.on(protocol, "markers", (value) => void seen.push(`markers ${value}`));
  a.notify(protocol, "selection", 1, { coalesce: true });
  a.notify(protocol, "markers", "m1", { coalesce: true });
  a.notify(protocol, "selection", 2, { coalesce: true });
  assert.equal(sent.length, 0, "nothing leaves before the task ends");
  await tick();
  assert.deepEqual(
    sent.map((envelope) => [envelope.kind, envelope.version]),
    [["batch", 1]],
  );
  assert.deepEqual(seen, ["selection 2", "markers m1"]);
  a.notify(protocol, "selection", 3, { coalesce: true });
  await tick();
  assert.equal(sent[1]?.version, 2);
});

test("a request or plain notification sends the pending batch first, so it never overtakes state", async () => {
  const { a, b, sent } = pair();
  const order: string[] = [];
  b.on(protocol, "selection", (value) => void order.push(`selection ${value}`));
  b.on(protocol, "log", (value) => void order.push(`log ${value}`));
  b.handle(protocol, "read", (value) => {
    order.push(`read ${value}`);
    return "ok";
  });
  a.notify(protocol, "selection", 7, { coalesce: true });
  a.notify(protocol, "log", "after");
  void a.call(protocol, "read", 1);
  await tick();
  assert.deepEqual(
    sent.map((envelope) => envelope.kind),
    ["batch", "notify", "request"],
  );
  assert.deepEqual(order, ["selection 7", "log after", "read 1"]);
});

test("a batch not newer than the last applied one is dropped whole", async () => {
  const { b, warnings, receive } = pair();
  const seen: number[] = [];
  b.on(protocol, "selection", (value) => void seen.push(value));
  const batch = (version: number, value: number) => ({
    kind: "batch",
    version,
    messages: [
      {
        kind: "notify",
        channel: "batching",
        method: "selection",
        params: value,
      },
    ],
  });
  receive(batch(2, 20));
  await tick();
  receive(batch(1, 10));
  receive(batch(2, 21));
  await tick();
  receive(batch(3, 30));
  await tick();
  assert.deepEqual(seen, [20, 30]);
  assert.equal(
    warnings.filter((warning) => warning === "Dropped stale RPC batch").length,
    2,
  );
});

test("batches carry notifications only", () => {
  assert.throws(
    () =>
      parseEnvelope({
        kind: "batch",
        version: 1,
        messages: [{ kind: "cancel", id: 1 }],
      }),
    /notifications only/,
  );
});

test("disposing sends what is pending", async () => {
  const { a, sent } = pair();
  a.notify(protocol, "selection", 1, { coalesce: true });
  await a.dispose();
  assert.deepEqual(
    sent.map((envelope) => envelope.kind),
    ["batch"],
  );
  assert.throws(() => a.notify(protocol, "selection", 2, { coalesce: true }));
});
