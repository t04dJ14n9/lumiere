import { provideHostServices } from "../../../src/shared/host";
import type { PanelShell } from "../../../src/shared/host";
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { CancelToken } from "../../../src/shared/rpc/lifecycle";
import { SearchWorker } from "../../../src/plugins/search/runner";

let directory: string;
let path: string;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), "workbench-search-unit-"));
  path = join(directory, "search.cjs");
  await build({
    entryPoints: ["src/workers/search.ts"],
    outfile: path,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node20",
  });
});

test("search worker evaluates multiple documents and survives a document parse error", async () => {
  const worker = new SearchWorker(path, "content:meeting");
  try {
    assert.equal(
      await worker.matches({ path: "One.md", text: "Meeting notes" }),
      true,
    );
    assert.equal(
      await worker.matches({ path: "Two.md", text: "Other notes" }),
      false,
    );
    await assert.rejects(
      worker.matches({ path: "Broken.canvas", text: "{broken" }),
    );
    assert.equal(worker.stopped, false);
    assert.equal(
      await worker.matches({ path: "Three.md", text: "Another meeting" }),
      true,
    );
  } finally {
    await worker.dispose();
  }
});
test("invalid search queries reject worker readiness", async () => {
  const worker = new SearchWorker(path, "meeting OR");
  try {
    // The message crosses the worker boundary once, without "Error: " prefixes.
    await assert.rejects(worker.ready, (error: Error) => {
      assert.match(error.message, /^Expected a search term/);
      return true;
    });
  } finally {
    await worker.dispose();
  }
});
test("search cancellation rejects pending work and prevents later submissions", async () => {
  const controller = new CancelToken();
  const worker = new SearchWorker(path, "/(a+)+$/", { token: controller });
  await worker.ready;
  const pending = worker.matches({
    path: "Slow.md",
    text: "a".repeat(40) + "!",
  });
  const rejected = assert.rejects(pending, { code: "Cancelled" });
  await new Promise<void>((resolve) => setImmediate(resolve));
  controller.cancel();
  await rejected;
  assert.equal(worker.stopped, true);
  await assert.rejects(worker.matches({ path: "Next.md", text: "x" }), {
    code: "Cancelled",
  });
  await worker.dispose();
});
test("a pathological regex times out in its worker and a fresh worker remains usable", async () => {
  const worker = new SearchWorker(path, "/(a+)+$/", { timeoutMs: 100 });
  try {
    await assert.rejects(
      worker.matches({ path: "Slow.md", text: "a".repeat(40) + "!" }),
      /evaluation timed out/,
    );
  } finally {
    await worker.dispose();
  }
  const next = new SearchWorker(path, "working");
  try {
    assert.equal(
      await next.matches({ path: "Next.md", text: "working" }),
      true,
    );
  } finally {
    await next.dispose();
  }
});

after(async () => {
  await rm(directory, { recursive: true, force: true });
});

test("search host cancels work on disable and registers again on enable", async () => {
  const { createRoot } = await import("@workshop/core");
  const { searchHost } = await import("../../../src/plugins/search/host");
  const { protocol } = await import("../../../src/plugins/search/protocol");
  const { MemoryVaultIndex } =
    await import("../../../src/plugins/vault/memory-index");
  const { fakeHost } = await import("../../support/vscode-fake");
  const { rpcPair } = await import("../../support/rpc-pair");
  const pair = rpcPair();
  const root = createRoot();
  const vault = new MemoryVaultIndex({
    root: "file:///vault",
    folderNote: "",
    linkFormat: "shortest",
  });
  vault.upsertFile({
    uri: "file:///vault/Note.md",
    path: "Note.md",
    mtime: 0,
    size: 1,
  });
  root.provide("rpc", pair.host);
  root.provide("vault", vault);
  root.provide("vaults", {
    text: async () => "working",
    forDocument: async () => ({
      index: vault,
      settled: async () => {},
      pathOf: () => "Note.md",
    }),
    forWorkspace: async () => undefined,
    locate: async () => undefined,
    open: async () => {},
    all: () => [],
    registerLinkPolicy: () => () => {},
    invalidateLinkResolution() {},
  });
  provideHostServices(
    root,
    fakeHost({ extensions: { workerPath: () => path } }),
  );
  const start = () =>
    root.plugin(searchHost, {
      panel: {} as PanelShell,
    });
  let fiber = start();
  await root.settled();
  assert.equal(
    (
      await pair.client.call(protocol, "query", {
        query: "working",
        source: "file:///vault/Note.md",
      })
    ).results.length,
    1,
  );
  await assert.rejects(
    pair.client.call(protocol, "query", {
      query: "working",
      source: "file:///outside.md",
    }),
    /Unknown search source/,
  );
  const pending = pair.client.call(protocol, "query", {
    query: "working",
    source: "file:///vault/Note.md",
  });
  const rejected = assert.rejects(pending, { code: "PluginDisabled" });
  await fiber.dispose();
  await rejected;
  fiber = start();
  await root.settled();
  assert.equal(fiber.state, "active");
  assert.equal(
    (
      await pair.client.call(protocol, "query", {
        query: "working",
        source: "file:///vault/Note.md",
      })
    ).results.length,
    1,
  );
  await root.dispose();
  await pair.dispose();
});

test("search worker advertises indexed requirements and evaluates transported metadata", async () => {
  const worker = new SearchWorker(path, "tag:project [priority:>2]");
  try {
    await worker.ready;
    assert.equal(worker.requiresText, false);
    assert.equal(worker.requiresMetadata, true);
    assert.equal(
      await worker.matches({
        path: "Note.md",
        text: "",
        metadata: { tags: ["project/notes"], properties: { priority: 3 } },
      }),
      true,
    );
    assert.equal(
      await worker.matches({
        path: "Note.md",
        text: "",
        metadata: { tags: ["project"], properties: { priority: 1 } },
      }),
      false,
    );
  } finally {
    await worker.dispose();
  }
});
