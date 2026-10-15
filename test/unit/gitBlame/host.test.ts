import test from "node:test";
import assert from "node:assert/strict";
import { Context } from "../../../src/kernel";
import type { GitAccess } from "../../../src/shared/git";
import { MAX_DIFF_CHARS } from "../../../src/shared/diff";
import {
  gitBlameHost,
  readBlameLine,
} from "../../../src/plugins/gitBlame/host";
import { protocol } from "../../../src/plugins/gitBlame/protocol";
import { rpcPair } from "../../support/rpc-pair";

function fakeGit() {
  let generation = 0;
  const listeners = new Set<() => void>();
  const requests: unknown[] = [];
  const git: GitAccess = {
    baseline: async () => ({ status: "unavailable" }),
    stage: async () => false,
    toGitUri: () => undefined,
    repoGeneration: () => generation,
    identity: async () => ({ userName: "Ada", userEmail: "ada@example.com" }),
    onDidChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async blameLine(uri, line, snapshot) {
      requests.push({ uri, line, snapshot });
      return { status: "uncommitted", repoGeneration: generation };
    },
  };
  return {
    git,
    requests,
    listeners,
    bump() {
      generation++;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

async function setup(git?: GitAccess) {
  const pair = rpcPair();
  const root = Context.create();
  const document = { uri: "file:///note.md" };
  root.provide("workshop", { git } as never);
  root.provide("rpc", pair.host);
  const fiber = root.plugin(gitBlameHost, { panel: { document } } as never);
  await root.settled();
  assert.equal(fiber.state, "active");
  return {
    pair,
    root,
    fiber,
    document,
    async dispose() {
      await root.dispose();
      await pair.dispose();
    },
  };
}

test("host changed is immediate, required generation, and never re-bumps", async (t) => {
  const fake = fakeGit();
  const host = await setup(fake.git);
  t.after(() => host.dispose());
  const generations: number[] = [];
  host.pair.client.on(protocol, "changed", ({ repoGeneration }) => {
    generations.push(repoGeneration);
  });
  fake.bump();
  await Promise.resolve();
  assert.deepEqual(generations, [1]);
  assert.equal(fake.git.repoGeneration("file:///note.md"), 1);
  await host.fiber.dispose();
  assert.equal(fake.listeners.size, 0);
});

test("host binds blame and identity to the panel document, including URI replacement", async (t) => {
  const fake = fakeGit();
  const host = await setup(fake.git);
  t.after(() => host.dispose());
  const params = { line: 2, contents: "unsaved\nalpha\n", version: 8 };
  assert.equal(
    (await host.pair.client.call(protocol, "blameLine", params)).status,
    "uncommitted",
  );
  assert.deepEqual(fake.requests, [
    {
      uri: "file:///note.md",
      line: 2,
      snapshot: { contents: params.contents, version: 8 },
    },
  ]);
  assert.equal(
    (await host.pair.client.call(protocol, "identity", {}))?.userName,
    "Ada",
  );
  host.document.uri = "file:///renamed.md";
  await host.pair.client.call(protocol, "blameLine", params);
  assert.equal((fake.requests[1] as { uri: string }).uri, "file:///renamed.md");
});

test("contents cap is enforced by behavioral schema parsing", () => {
  const params = protocol.requests.blameLine.params;
  assert.throws(() =>
    params.parse({
      line: 1,
      contents: "x".repeat(MAX_DIFF_CHARS + 1),
      version: 1,
    }),
  );
  assert.equal(
    params.parse({
      line: 1,
      contents: "x".repeat(MAX_DIFF_CHARS),
      version: "revision",
    }).line,
    1,
  );
  for (const line of [0, 1.5, -1, Infinity]) {
    assert.throws(() => params.parse({ line, contents: "x", version: 1 }));
  }
  assert.throws(() => params.parse({ line: 1, contents: "x", version: {} }));
  assert.throws(() => protocol.notifications.changed.parse({}));
  assert.throws(() =>
    protocol.notifications.changed.parse({ repoGeneration: 1.5 }),
  );
  assert.throws(() =>
    protocol.requests.blameLine.result.parse({
      status: "ok",
      repoGeneration: 0,
    }),
  );
});

test("host over-cap defense never calls GitAccess; absent git soft-hides", async (t) => {
  const fake = fakeGit();
  fake.bump();
  assert.deepEqual(
    await readBlameLine(fake.git, "file:///note.md", {
      line: 1,
      contents: "x".repeat(MAX_DIFF_CHARS + 1),
      version: 1,
    }),
    { status: "unavailable", repoGeneration: 1 },
  );
  assert.equal(fake.requests.length, 0);
  const host = await setup();
  t.after(() => host.dispose());
  assert.deepEqual(
    await host.pair.client.call(protocol, "blameLine", {
      line: 1,
      contents: "x",
      version: 1,
    }),
    { status: "unavailable", repoGeneration: 0 },
  );
  assert.equal(
    await host.pair.client.call(protocol, "identity", {}),
    undefined,
  );
});
