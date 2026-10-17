import assert from "node:assert/strict";
import test from "node:test";
import { Schema } from "@workshop/core";
import { defineProtocol } from "../../../src/shared/rpc/protocol";
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

/** One endpoint fed raw envelopes; records what it sends back. */
function receiver() {
  const sent: { kind: string; [key: string]: unknown }[] = [];
  let receive: (value: unknown) => void = () => {};
  const endpoint = new Endpoint(
    {
      send: (value) => void sent.push(value as { kind: string }),
      listen(listener) {
        receive = listener;
        return () => {};
      },
    },
    clock,
  );
  return { endpoint, sent, receive: (value: unknown) => receive(value) };
}

function gate() {
  let open: () => void = () => {};
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { opened, open };
}

const batch = (version: number, ...messages: [string, unknown][]) => ({
  kind: "batch",
  version,
  messages: messages.map(([method, params]) => ({
    kind: "notify",
    channel: protocol.id,
    method,
    params,
  })),
});

test("a request waits until an earlier batch's asynchronous handlers have finished applying", async () => {
  const { endpoint, sent, receive } = receiver();
  const hold = gate();
  let selection = 0;
  endpoint.on(protocol, "selection", async (value) => {
    await hold.opened;
    selection = value;
  });
  let observed: number | undefined;
  endpoint.handle(protocol, "read", () => {
    observed = selection;
    return String(selection);
  });
  receive(batch(1, ["selection", 7]));
  receive({
    kind: "request",
    id: 1,
    channel: protocol.id,
    method: "read",
    params: 0,
  });
  await tick();
  assert.equal(observed, undefined, "the request has not run yet");
  hold.open();
  await tick();
  assert.equal(observed, 7);
  assert.deepEqual(sent, [{ kind: "response", id: 1, result: "7" }]);
});

test("overlapping batches apply one after the other, never interleaved", async () => {
  const { endpoint, receive } = receiver();
  const hold = gate();
  const applied: string[] = [];
  endpoint.on(protocol, "selection", async (value) => {
    if (value === 1) {
      await hold.opened;
    }
    applied.push(`selection ${value}`);
  });
  endpoint.on(
    protocol,
    "markers",
    (value) => void applied.push(`markers ${value}`),
  );
  receive(batch(1, ["selection", 1], ["markers", "m1"]));
  receive(batch(2, ["selection", 2], ["markers", "m2"]));
  await tick();
  assert.deepEqual(applied, []);
  hold.open();
  await tick();
  assert.deepEqual(applied, [
    "selection 1",
    "markers m1",
    "selection 2",
    "markers m2",
  ]);
});

test("a response is handled while a batch is suspended, so a handler awaiting a call does not deadlock", async () => {
  const { endpoint, sent, receive } = receiver();
  let result: string | undefined;
  endpoint.on(protocol, "selection", async () => {
    result = await endpoint.call(protocol, "read", 1);
  });
  receive(batch(1, ["selection", 1]));
  await tick();
  const request = sent.find((envelope) => envelope.kind === "request")!;
  receive({ kind: "response", id: request.id, result: "answer" });
  await tick();
  assert.equal(result, "answer");
});

test("a request cancelled while it waits for state never runs", async () => {
  const { endpoint, sent, receive } = receiver();
  const hold = gate();
  let ran = false;
  endpoint.on(protocol, "selection", () => hold.opened);
  endpoint.handle(protocol, "read", () => {
    ran = true;
    return "x";
  });
  receive(batch(1, ["selection", 1]));
  receive({
    kind: "request",
    id: 5,
    channel: protocol.id,
    method: "read",
    params: 0,
  });
  receive({ kind: "cancel", id: 5 });
  hold.open();
  await tick();
  assert.equal(ran, false);
  assert.deepEqual(sent, []);
});

test("disposing while a batch is suspended applies nothing more, and dispose does not wait for the handler", async () => {
  const { endpoint, receive } = receiver();
  const hold = gate();
  const applied: string[] = [];
  endpoint.on(protocol, "selection", async (value) => {
    await hold.opened;
    applied.push(`selection ${value}`);
  });
  endpoint.on(
    protocol,
    "markers",
    (value) => void applied.push(`markers ${value}`),
  );
  receive(batch(1, ["selection", 1], ["markers", "m1"]));
  receive(batch(2, ["markers", "m2"]));
  await tick();
  await endpoint.dispose();
  hold.open();
  await tick();
  assert.deepEqual(applied, ["selection 1"]);
});

test("replacement peer batches restart without accepting retired traffic", async () => {
  let receive: (value: unknown) => void = () => {};
  let clientReceive: (value: unknown) => void = () => {};
  const oldMessages: unknown[] = [];
  const host = new Endpoint(
    {
      listen: (handler) => {
        receive = handler;
        return () => {};
      },
      send: (message) => clientReceive(message),
    },
    clock,
    undefined,
    { session: "host", restartOn: "batching/read" },
  );
  host.handle(protocol, "read", () => "ready");
  const seen: number[] = [];
  host.on(protocol, "selection", (value) => {
    seen.push(value);
  });
  const make = () =>
    new Endpoint(
      {
        listen: (handler) => {
          clientReceive = handler;
          return () => {};
        },
        send: (message) => {
          oldMessages.push(message);
          receive(message);
        },
      },
      clock,
      undefined,
      { session: crypto.randomUUID() },
    );
  const first = make();
  await first.call(protocol, "read", 0);
  for (const value of [1, 2, 3]) {
    first.notify(protocol, "selection", value, { coalesce: true });
    first.flush();
    await tick();
  }
  const delayed = oldMessages.at(-1);
  const retiredHandshake = oldMessages[0];
  await first.dispose();
  const second = make();
  await second.call(protocol, "read", 0);
  second.notify(protocol, "selection", 4, { coalesce: true });
  second.flush();
  await tick();
  receive(delayed);
  receive(retiredHandshake);
  await tick();
  assert.deepEqual(seen, [1, 2, 3, 4]);
  await second.dispose();
  await host.dispose();
});

test("a replacement renderer rejects already-sent replies and state addressed to its predecessor", async () => {
  let hostIn: (message: unknown) => void = () => {};
  let clientIn: (message: unknown) => void = () => {};
  const outbound: unknown[] = [];
  const host = new Endpoint(
    {
      listen: (handler) => {
        hostIn = handler;
        return () => {};
      },
      send: (message) => {
        outbound.push(message);
      },
    },
    clock,
    undefined,
    { session: "host", restartOn: "batching/read" },
  );
  host.handle(protocol, "read", (value) => String(value));
  const make = (session: string) =>
    new Endpoint(
      {
        listen: (handler) => {
          clientIn = handler;
          return () => {};
        },
        send: (message) => hostIn(message),
      },
      clock,
      undefined,
      { session },
    );
  const old = make("old");
  const first = old.call(protocol, "read", 1);
  await tick();
  const oldReply = outbound.shift();
  clientIn(oldReply);
  assert.equal(await first, "1");
  host.notify(protocol, "selection", 7);
  const oldState = outbound.shift();
  await old.dispose();
  const fresh = make("fresh");
  const seen: number[] = [];
  fresh.on(protocol, "selection", (value) => {
    seen.push(value);
  });
  let completed = false;
  const ready = fresh.call(protocol, "read", 2).then((value) => {
    completed = true;
    return value;
  });
  await tick();
  clientIn(oldReply);
  clientIn(oldState);
  await tick();
  assert.equal(completed, false);
  assert.deepEqual(seen, []);
  clientIn(outbound.shift());
  assert.equal(await ready, "2");
  await fresh.dispose();
  await host.dispose();
});
