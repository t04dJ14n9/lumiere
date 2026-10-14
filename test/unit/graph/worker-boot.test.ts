import test from "node:test";
import assert from "node:assert/strict";
import {
  startLayoutWorker,
  stopLayoutWorker,
} from "../../../src/webview/graph/worker-boot";
import type { ScriptWorker } from "../../../src/webview/graph/worker-boot";

function worker(): ScriptWorker & { stopped: boolean; messages: unknown[] } {
  const created = {
    stopped: false,
    messages: [] as unknown[],
    onmessage: null,
    postMessage(message: unknown) {
      created.messages.push(message);
    },
    terminate() {
      created.stopped = true;
    },
  };
  return created;
}

test("the layout worker is started from a blob URL and revoked on stop", async () => {
  const created = worker();
  const revoked: string[] = [];
  const session = await startLayoutWorker({
    scriptUrl: "https://extension/graph-layout.js",
    ticket: 1,
    isCurrent: () => true,
    fetchScript: async () => "self.onmessage = () => {};",
    createObjectUrl: (source) => {
      assert.match(source, /onmessage/);
      return "blob:worker";
    },
    revokeObjectUrl: (url) => revoked.push(url),
    createWorker: (objectUrl) => {
      assert.equal(objectUrl, "blob:worker");
      return created;
    },
  });
  assert.equal(session?.objectUrl, "blob:worker");
  stopLayoutWorker(session, (url) => revoked.push(url));
  assert.equal(created.stopped, true);
  assert.deepEqual(created.messages, [{ type: "stop" }]);
  assert.deepEqual(revoked, ["blob:worker"]);
});

test("a cancelled layout worker revokes the blob and does not start", async () => {
  const revoked: string[] = [];
  let spawned = false;
  let checks = 0;
  const session = await startLayoutWorker({
    scriptUrl: "https://extension/graph-layout.js",
    ticket: 1,
    isCurrent: () => {
      checks += 1;
      return checks === 1;
    },
    fetchScript: async () => "var layout = 1;",
    createObjectUrl: () => "blob:stale",
    revokeObjectUrl: (url) => revoked.push(url),
    createWorker: () => {
      spawned = true;
      return worker();
    },
  });
  assert.equal(session, undefined);
  assert.equal(spawned, false);
  assert.deepEqual(revoked, ["blob:stale"]);
});
