import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import {
  nodeDigests,
  nodeRealPaths,
  nodeWorkerLauncher,
} from "../src/node/index";

test("digests are lowercase hex SHA-256 and HMAC-SHA-256", () => {
  assert.equal(
    nodeDigests.sha256("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assert.equal(
    nodeDigests.sha256(new TextEncoder().encode("abc")),
    nodeDigests.sha256("abc"),
  );
  // RFC 4231, test case 2.
  assert.equal(
    nodeDigests.hmacSha256(
      new TextEncoder().encode("Jefe"),
      "what do ya want for nothing?",
    ),
    "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
  );
});

let folder: string;
before(async () => {
  folder = await mkdtemp(path.join(tmpdir(), "platform-node-"));
  await mkdir(path.join(folder, "vault/notes"), { recursive: true });
  await writeFile(path.join(folder, "outside.md"), "");
  await symlink(
    path.join(folder, "outside.md"),
    path.join(folder, "vault/escape.md"),
  );
  await writeFile(
    // Stands in for a built worker: it echoes what it is sent.
    path.join(folder, "vault.cjs"),
    `const { parentPort, workerData } = require("node:worker_threads");
parentPort.postMessage({ data: workerData });
parentPort.on("message", (message) => {
  if (message === "exit") process.exit(3);
  parentPort.postMessage({ echo: message });
});`,
  );
});
after(() => rm(folder, { recursive: true, force: true }));

test("real paths judge symbolic links by where they lead", async () => {
  const vault = path.join(folder, "vault");
  assert.equal(
    await nodeRealPaths.isInside(vault, path.join(vault, "notes")),
    true,
  );
  assert.equal(
    await nodeRealPaths.isInside(vault, path.join(vault, "escape.md")),
    false,
  );
  await assert.rejects(
    nodeRealPaths.isInside(vault, path.join(vault, "notes/new.md")),
    { code: "ENOENT" },
  );
  assert.equal(
    await nodeRealPaths.isInside(
      vault,
      path.join(vault, "notes/new folder/new.md"),
      "nearest-ancestor",
    ),
    true,
  );
});

test("a launched worker gets its data, echoes messages and reports its exit", async () => {
  const worker = nodeWorkerLauncher(folder).start("vault", {
    data: { query: "x" },
    memoryLimitMb: 64,
  });
  const messages: unknown[] = [];
  const exited = new Promise<number>((resolve) => worker.onExit(resolve));
  const received = (count: number) =>
    new Promise<void>((resolve) => {
      worker.onMessage((message) => {
        messages.push(message);
        if (messages.length === count) {
          resolve();
        }
      });
    });
  const both = received(2);
  worker.post("hello");
  await both;
  assert.deepEqual(messages, [{ data: { query: "x" } }, { echo: "hello" }]);
  worker.post("exit");
  assert.equal(await exited, 3);
});

test("a worker that is not built fails to start, and says so", async () => {
  const worker = nodeWorkerLauncher(folder).start("search");
  const failed = new Promise<Error>((resolve) => worker.onError(resolve));
  assert.match((await failed).message, /search\.cjs/);
  await worker.terminate();
});
