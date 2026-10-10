import assert from "node:assert/strict";
import { test } from "node:test";
import { HostInbox } from "../../src/shared/host-inbox";

test("load generations advance and remain stable between loads", () => {
  const inbox = new HostInbox<string>();
  assert.equal(inbox.generation, 0);
  assert.equal(inbox.beginLoad(), 1);
  assert.equal(inbox.generation, 1);
  assert.equal(inbox.generation, 1);
  assert.equal(inbox.beginLoad(), 2);
  assert.equal(inbox.generation, 2);
});

test("messages queue FIFO until a matching viewer attaches, then deliver once", () => {
  const inbox = new HostInbox<string>();
  const seen: string[] = [];
  const generation = inbox.beginLoad();
  inbox.receive("first");
  inbox.receive("second");
  assert.equal(seen.length, 0);
  inbox.listen(message => seen.push(message), generation);
  assert.deepEqual(seen, ["first", "second"]);
  inbox.receive("third");
  inbox.listen(message => seen.push(message), generation);
  assert.deepEqual(seen, ["first", "second", "third"]);
});

test("a reload during queued delivery invalidates the attached listener", () => {
  const inbox = new HostInbox<string>();
  const seen: string[] = [];
  const first = inbox.beginLoad();
  const detach = inbox.listen(message => seen.push(`old:${message}`), first);
  inbox.receive("delivered");
  detach();
  inbox.receive("old queued");
  inbox.listen(() => { inbox.beginLoad(); }, first);
  const latest = inbox.generation;
  inbox.receive("new queued");
  inbox.listen(message => seen.push(`new:${message}`), latest);
  assert.deepEqual(seen, ["old:delivered", "new:new queued"]);
});

test("reload drops queued navigation even when no viewer ever attached", () => {
  const inbox = new HostInbox<string>();
  const seen: string[] = [];
  inbox.beginLoad();
  inbox.receive("obsolete");
  const generation = inbox.beginLoad();
  inbox.receive("current");
  inbox.listen(message => seen.push(message), generation);
  assert.deepEqual(seen, ["current"]);
});

test("an old mounted viewer cannot consume messages received after reload", () => {
  const inbox = new HostInbox<string>();
  const old: string[] = [];
  const current: string[] = [];
  inbox.listen(message => old.push(message), inbox.beginLoad());
  const generation = inbox.beginLoad();
  inbox.receive("new navigation");
  assert.deepEqual(old, []);
  inbox.listen(message => current.push(message), generation);
  assert.deepEqual(current, ["new navigation"]);
});

test("an old component rerender cannot drain the new load's pending queue", () => {
  const inbox = new HostInbox<string>();
  const old: string[] = [];
  const current: string[] = [];
  const previous = inbox.beginLoad();
  const generation = inbox.beginLoad();
  inbox.receive("new navigation");
  const detachOld = inbox.listen(message => old.push(message), previous);
  assert.deepEqual(old, []);
  inbox.listen(message => current.push(message), generation);
  detachOld();
  inbox.receive("another navigation");
  assert.deepEqual(current, ["new navigation", "another navigation"]);
});

test("mismatched registrations cannot replace the current listener", () => {
  const inbox = new HostInbox<string>();
  const seen: string[] = [];
  const generation = inbox.beginLoad();
  inbox.listen(message => seen.push(message), generation);
  for (const invalid of [generation - 1, generation + 1, NaN, Infinity]) {
    inbox.listen(() => assert.fail("invalid viewer attached"), invalid)();
  }
  inbox.receive("current");
  assert.deepEqual(seen, ["current"]);
});

test("old cleanup cannot detach a replacement using the same callback", () => {
  const inbox = new HostInbox<string>();
  const seen: string[] = [];
  const listener = (message: string) => { seen.push(message); };
  const generation = inbox.beginLoad();
  const detachOld = inbox.listen(listener, generation);
  const detachCurrent = inbox.listen(listener, generation);
  detachOld();
  detachOld();
  inbox.receive("current");
  detachCurrent();
  inbox.receive("queued");
  assert.deepEqual(seen, ["current"]);
  inbox.listen(listener, generation);
  assert.deepEqual(seen, ["current", "queued"]);
});

test("cleanup retained from an old load cannot detach the new viewer", () => {
  const inbox = new HostInbox<string>();
  const seen: string[] = [];
  const listener = (message: string) => { seen.push(message); };
  const detachOld = inbox.listen(listener, inbox.beginLoad());
  inbox.listen(listener, inbox.beginLoad());
  detachOld();
  inbox.receive("new viewer");
  assert.deepEqual(seen, ["new viewer"]);
});

test("reentrant receive waits behind queued messages and finishes callbacks first", () => {
  const inbox = new HostInbox<string>();
  const seen: string[] = [];
  const generation = inbox.beginLoad();
  inbox.receive("first");
  inbox.receive("second");
  inbox.listen(message => {
    seen.push(`start:${message}`);
    if (message === "first") inbox.receive("third");
    seen.push(`end:${message}`);
  }, generation);
  assert.deepEqual(seen, [
    "start:first", "end:first", "start:second", "end:second", "start:third", "end:third",
  ]);
});

test("a listener replaced while flushing sends remaining messages to its replacement", () => {
  const inbox = new HostInbox<string>();
  const seen: string[] = [];
  const generation = inbox.beginLoad();
  inbox.receive("first");
  inbox.receive("second");
  const detachOld = inbox.listen(message => {
    seen.push(`old:${message}`);
    inbox.listen(next => seen.push(`new:${next}`), generation);
    inbox.receive("third");
    seen.push("old callback finished");
  }, generation);
  detachOld();
  inbox.receive("fourth");
  assert.deepEqual(seen, [
    "old:first", "old callback finished", "new:second", "new:third", "new:fourth",
  ]);
});

test("detaching during delivery leaves remaining messages queued for the next listener", () => {
  const inbox = new HostInbox<string>();
  const seen: string[] = [];
  const generation = inbox.beginLoad();
  const detach = inbox.listen(message => {
    seen.push(`old:${message}`);
    inbox.receive("second");
    detach();
    inbox.receive("third");
  }, generation);
  inbox.receive("first");
  assert.deepEqual(seen, ["old:first"]);
  inbox.listen(message => seen.push(`new:${message}`), generation);
  assert.deepEqual(seen, ["old:first", "new:second", "new:third"]);
});

test("reload during a flush discards its old tail and rejects stale reattachment", () => {
  const inbox = new HostInbox<string>();
  const seen: string[] = [];
  const generation = inbox.beginLoad();
  inbox.receive("first");
  inbox.receive("obsolete tail");
  inbox.listen(message => {
    seen.push(`old:${message}`);
    inbox.beginLoad();
    inbox.receive("current");
    inbox.listen(() => assert.fail("stale viewer attached"), generation);
  }, generation);
  assert.deepEqual(seen, ["old:first"]);
  inbox.listen(message => seen.push(`new:${message}`), inbox.generation);
  assert.deepEqual(seen, ["old:first", "new:current"]);
});

test("a new load attached reentrantly drains only new messages after the callback", () => {
  const inbox = new HostInbox<string>();
  const seen: string[] = [];
  const generation = inbox.beginLoad();
  inbox.receive("first");
  inbox.receive("obsolete tail");
  inbox.listen(message => {
    seen.push(`old:${message}`);
    const nextGeneration = inbox.beginLoad();
    inbox.receive("current");
    inbox.listen(next => seen.push(`new:${next}`), nextGeneration);
    inbox.receive("latest");
    seen.push("old callback finished");
  }, generation);
  assert.deepEqual(seen, [
    "old:first", "old callback finished", "new:current", "new:latest",
  ]);
});

test("pending messages are capped at the latest 512 and keep their order", () => {
  const inbox = new HostInbox<number>();
  const seen: number[] = [];
  const generation = inbox.beginLoad();
  for (let i = 0; i < 2000; i += 1) inbox.receive(i);
  inbox.listen(message => seen.push(message), generation);
  assert.deepEqual(seen, Array.from({ length: 512 }, (_, i) => 1488 + i));
});

test("reentrant receive also respects the pending-message cap", () => {
  const inbox = new HostInbox<number>();
  const seen: number[] = [];
  inbox.listen(message => {
    seen.push(message);
    if (message === -1) {
      for (let i = 0; i < 1024; i += 1) inbox.receive(i);
    }
  }, inbox.beginLoad());
  inbox.receive(-1);
  assert.deepEqual(seen, [-1, ...Array.from({ length: 512 }, (_, i) => 512 + i)]);
});

test("a throwing callback does not permanently block the drain or replay its message", () => {
  const inbox = new HostInbox<string>();
  const seen: string[] = [];
  const generation = inbox.beginLoad();
  inbox.receive("throws");
  inbox.receive("remaining");
  assert.throws(() => inbox.listen(() => { throw new Error("listener failed"); }, generation), /listener failed/);
  inbox.listen(message => seen.push(message), generation);
  inbox.receive("later");
  assert.deepEqual(seen, ["remaining", "later"]);
});

test("generic messages may be undefined or other falsy values", () => {
  const inbox = new HostInbox<undefined | null | number | boolean>();
  const seen: (undefined | null | number | boolean)[] = [];
  inbox.receive(undefined);
  inbox.receive(null);
  inbox.receive(0);
  inbox.receive(false);
  inbox.listen(message => seen.push(message), inbox.generation);
  assert.deepEqual(seen, [undefined, null, 0, false]);
});

test("separate webviews have independent listeners, queues, and load generations", () => {
  const first = new HostInbox<string>();
  const second = new HostInbox<string>();
  const seen: string[] = [];
  second.receive("queued in second");
  first.beginLoad();
  first.listen(() => assert.fail("received another webview's navigation"), first.generation);
  second.listen(message => seen.push(message), second.generation);
  first.beginLoad();
  second.receive("second remains attached");
  assert.equal(second.generation, 0);
  assert.deepEqual(seen, ["queued in second", "second remains attached"]);
});
