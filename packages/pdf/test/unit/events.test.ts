import assert from "node:assert/strict";
import { test } from "node:test";
import { Emitter } from "../../src/host/events";

test("listeners hear an event in the order they subscribed, until they stop", () => {
  const emitter = new Emitter<number>();
  const heard: string[] = [];
  const first = emitter.event((value) => heard.push(`a${value}`));
  emitter.event((value) => heard.push(`b${value}`));
  emitter.fire(1);
  first.dispose();
  emitter.fire(2);
  assert.deepEqual(heard, ["a1", "b1", "b2"]);
});

test("a listener that throws is reported, and the others still hear the event", (t) => {
  const reported = t.mock.method(console, "error", () => undefined);
  const emitter = new Emitter<void>();
  let heard = false;
  emitter.event(() => {
    throw new Error("broken listener");
  });
  emitter.event(() => {
    heard = true;
  });
  emitter.fire();
  assert.equal(heard, true);
  assert.equal(reported.mock.callCount(), 1);
});

test("while an event fires, a removed listener hears no more and an added one waits for the next", () => {
  const emitter = new Emitter<number>();
  const heard: string[] = [];
  let late: { dispose(): void } | undefined;
  emitter.event((value) => {
    heard.push(`a${value}`);
    second.dispose();
    late ??= emitter.event((next) => heard.push(`late${next}`));
  });
  const second = emitter.event((value) => heard.push(`b${value}`));
  emitter.fire(1);
  emitter.fire(2);
  assert.deepEqual(heard, ["a1", "a2", "late2"]);
});

test("a disposed emitter keeps no listeners and takes no new ones", () => {
  const emitter = new Emitter<void>();
  let calls = 0;
  emitter.event(() => calls++);
  emitter.dispose();
  emitter.event(() => calls++).dispose();
  emitter.fire();
  assert.equal(calls, 0);
});

test("the same listener subscribed twice hears twice and stops one at a time", () => {
  const emitter = new Emitter<void>();
  let calls = 0;
  const listener = () => calls++;
  const one = emitter.event(listener);
  emitter.event(listener);
  emitter.fire();
  one.dispose();
  emitter.fire();
  assert.equal(calls, 3);
});
