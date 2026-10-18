import assert from "node:assert/strict";
import test from "node:test";
import type { WorkerPort } from "../src/workers";
import { nodeDigests } from "../src/node/digests";
import {
  browserOperatingSystem,
  startWebWorker,
  webDigests,
  webWorkerLauncher,
} from "../src/web/index";

/** A stand-in for the browser's Worker: records posts, lets the test fire events. */
class FakeWorker extends EventTarget {
  static last: FakeWorker | undefined;
  readonly posted: unknown[] = [];
  terminated = false;
  constructor(
    readonly url: string,
    readonly options: { name?: string },
  ) {
    super();
    FakeWorker.last = this;
  }
  postMessage(message: unknown): void {
    this.posted.push(message);
  }
  terminate(): void {
    this.terminated = true;
  }
  receive(data: unknown): void {
    this.dispatchEvent(Object.assign(new Event("message"), { data }));
  }
  fail(message: string): void {
    this.dispatchEvent(Object.assign(new Event("error"), { message }));
  }
}

function withFakeWorker(run: () => Promise<void>): () => Promise<void> {
  return async () => {
    const original = globalThis.Worker;
    Object.assign(globalThis, { Worker: FakeWorker });
    try {
      await run();
    } finally {
      Object.assign(globalThis, { Worker: original });
    }
  };
}

test(
  "a web worker gets its start data first, then the host's messages",
  withFakeWorker(async () => {
    const channel = webWorkerLauncher("https://ext/dist/workers").start(
      "search",
      { data: { query: "x" }, memoryLimitMb: 256 },
    );
    const worker = FakeWorker.last!;
    assert.equal(worker.url, "https://ext/dist/workers/search.js");
    const received: unknown[] = [];
    channel.onMessage((message) => received.push(message));
    channel.post({ id: 1 });
    worker.receive({ reply: 1 });
    assert.deepEqual(worker.posted, [{ start: { query: "x" } }, { id: 1 }]);
    assert.deepEqual(received, [{ reply: 1 }]);
  }),
);

test(
  "a failed web worker reports its error, then exits, as a Node worker thread does",
  withFakeWorker(async () => {
    const channel = webWorkerLauncher("https://ext").start("vault");
    const events: string[] = [];
    channel.onError((error) => events.push(`error: ${error.message}`));
    channel.onExit((code) => events.push(`exit ${code}`));
    FakeWorker.last!.fail("importScripts failed");
    await Promise.resolve();
    assert.deepEqual(events, ["error: importScripts failed", "exit 1"]);
    assert.equal(FakeWorker.last!.terminated, true);
    await channel.terminate();
    assert.deepEqual(events, ["error: importScripts failed", "exit 1"]);
  }),
);

test(
  "terminating a web worker reports its exit once",
  withFakeWorker(async () => {
    const channel = webWorkerLauncher("https://ext").start("vault");
    const exits: number[] = [];
    channel.onExit((code) => exits.push(code));
    await channel.terminate();
    await channel.terminate();
    assert.deepEqual(exits, [1]);
  }),
);

test("a web worker's port serves once the start data arrives", () => {
  const scope = new EventTarget() as EventTarget & {
    posted: unknown[];
    postMessage(message: unknown): void;
  };
  scope.posted = [];
  scope.postMessage = (message) => scope.posted.push(message);
  const send = (data: unknown) =>
    scope.dispatchEvent(Object.assign(new Event("message"), { data }));
  const started: { port?: WorkerPort } = {};
  const received: unknown[] = [];
  startWebWorker(scope as never, (port) => {
    started.port = port;
    port.onMessage((message) => received.push(message));
  });
  assert.equal(started.port, undefined);
  send({ start: { query: "q" } });
  const port = started.port!;
  assert.deepEqual(port.data, { query: "q" });
  send("first");
  port.post("reply");
  port.close();
  send("after close");
  assert.deepEqual(received, ["first"]);
  assert.deepEqual(scope.posted, ["reply"]);
});

test("web digests equal Node's", () => {
  const key = new TextEncoder().encode("key");
  for (const text of ["", "abc", "é漢字🎉", "x".repeat(100_000)]) {
    assert.equal(webDigests.sha256(text), nodeDigests.sha256(text));
    assert.equal(
      webDigests.sha256(new TextEncoder().encode(text)),
      nodeDigests.sha256(text),
    );
    assert.equal(
      webDigests.hmacSha256(key, text),
      nodeDigests.hmacSha256(key, text),
    );
  }
});

test("the browser's user agent names the operating system", () => {
  const platform = (agent: string) => browserOperatingSystem(agent).platform;
  assert.equal(
    platform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/141"),
    "darwin",
  );
  assert.equal(platform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), "win32");
  assert.equal(platform("Mozilla/5.0 (X11; Linux x86_64)"), "linux");
});
