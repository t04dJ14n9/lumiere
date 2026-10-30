import assert from "node:assert/strict";
import { test } from "node:test";
import { createLoadReceiver } from "../../src/webview/load";
import type { HostMessage } from "../../src/shared/messages";
import { parseViewSettings } from "../../src/shared/view-settings";

type LoadMessage = Extract<HostMessage, { type: "load" }>;

const settings = parseViewSettings({});

function receiver(fetchBytes: (url: string) => Promise<ArrayBuffer>) {
  const opened: number[] = [];
  const failures: string[] = [];
  const receive = createLoadReceiver(
    {
      open: (data) => opened.push(new Uint8Array(data)[0] ?? -1),
      fail: (message) => failures.push(message),
    },
    fetchBytes,
  );
  return { receive, opened, failures };
}

const bytes = (first: number) => new Uint8Array([first, 0, 0]).buffer;

function deferred() {
  let resolve!: (data: ArrayBuffer) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<ArrayBuffer>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const load = (load: number, delivery: object) =>
  ({
    type: "load",
    load,
    settings,
    sha256: "test-sha",
    ...delivery,
  }) as LoadMessage;

test("bytes in the message open at once, as VS Code sends them", () => {
  const { receive, opened } = receiver(() => assert.fail("no fetch"));
  receive(load(1, { data: bytes(7) }));
  assert.deepEqual(opened, [7]);
});

test("a typed array in the message opens as its own bytes", () => {
  const { receive, opened } = receiver(() => assert.fail("no fetch"));
  const view = new Uint8Array([9, 9, 4, 0]).subarray(2);
  receive(load(1, { data: view }));
  assert.deepEqual(opened, [4]);
});

test("unreadable data in the message is reported, not opened", () => {
  const { receive, opened, failures } = receiver(() => assert.fail());
  receive(load(1, { data: "not bytes" }));
  assert.deepEqual(opened, []);
  assert.deepEqual(failures, [
    "The PDF data from the extension is not readable.",
  ]);
});

test("a URL is fetched and its body opened", async () => {
  const urls: string[] = [];
  const { receive, opened } = receiver(async (url) => {
    urls.push(url);
    return bytes(3);
  });
  receive(load(1, { url: "/lumiere/pdf/bytes?panel=p&load=1" }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(urls, ["/lumiere/pdf/bytes?panel=p&load=1"]);
  assert.deepEqual(opened, [3]);
});

test("a fetch that a newer load overtook is dropped, even if it finishes last", async () => {
  const first = deferred();
  const second = deferred();
  const fetches = [first, second];
  const { receive, opened, failures } = receiver(
    () => fetches.shift()!.promise,
  );
  receive(load(1, { url: "/one" }));
  receive(load(2, { url: "/two" }));
  second.resolve(bytes(2));
  await second.promise;
  first.resolve(bytes(1));
  await first.promise;
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(opened, [2]);
  assert.deepEqual(failures, []);
});

test("a failed fetch is reported only while it is the newest load", async () => {
  const first = deferred();
  const second = deferred();
  const fetches = [first, second];
  const { receive, failures } = receiver(() => fetches.shift()!.promise);
  receive(load(1, { url: "/one" }));
  first.reject(new Error("404 Not Found"));
  await new Promise((resolve) => setImmediate(resolve));
  receive(load(2, { url: "/two" }));
  receive(load(3, { data: bytes(5) }));
  second.reject(new Error("gone"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(failures, [
    "The PDF could not be downloaded: Error: 404 Not Found",
  ]);
});
