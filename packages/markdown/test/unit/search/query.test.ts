import test from "node:test";
import assert from "node:assert/strict";
import { searchVault } from "../../../src/plugins/search/query";
import type { SearchEvaluator } from "../../../src/plugins/search/runner";
import { MemoryVaultIndex } from "../../../src/plugins/vault/memory-index";
import { CancelToken } from "../../../src/shared/rpc/lifecycle";
import { compileSearch } from "../../../src/markdown/search/evaluate";
function vault() {
  const index = new MemoryVaultIndex({
    root: "file:///vault",
    folderNote: "",
    linkFormat: "shortest",
  });
  for (const path of [
    "folder/Note.md",
    "other/A #.md",
    "Hidden.md",
    "Broken.canvas",
    "image.png",
  ]) {
    index.upsertFile({
      path,
      uri: `file:///vault/${path}`,
      mtime: 0,
      size: 10,
      excluded: path === "Hidden.md",
    });
  }
  return index;
}
test("vault search uses live text, excludes hidden files and counts per-document errors", async () => {
  const reads: string[] = [];
  const worker: SearchEvaluator = {
    ready: Promise.resolve(),
    includesFiles: false,
    requiresText: true,
    requiresMetadata: false,
    stopped: false,
    matches: async (doc) => compileSearch("content:meeting")(doc),
    dispose: async () => {},
  };
  const input = {
    vault: vault(),
    source: "file:///vault/folder/Note.md",
    query: "content:meeting",
    worker,
    token: new CancelToken(),
    read: async (uri: string) => {
      reads.push(uri);
      return uri.endsWith("canvas") ? "{broken" : "Meeting";
    },
  };
  const result = await searchVault(input);
  assert.equal(result.unreadable, 1);
  assert.deepEqual(
    result.results.map((item) => item.href),
    ["../other/A%20%23.md", "Note.md"],
  );
  assert.ok(
    result.results.every(
      (item) =>
        item.matches?.length === 1 &&
        item.matches[0]?.text === "Meeting" &&
        item.matches[0]?.mark?.from === 0,
    ),
  );
  assert.equal(reads.length, 3);
  await assert.rejects(
    searchVault({ ...input, source: "file:///outside/Note.md" }),
    /Unknown search source/,
  );
  const token = new CancelToken();
  token.cancel();
  await assert.rejects(searchVault({ ...input, token }), { code: "Cancelled" });
});

test("indexed predicates avoid note reads while content scopes conservatively request text", async () => {
  const { metadata } = await import("../../../src/markdown/metadata");
  const { queryRequirements } =
    await import("../../../src/markdown/search/plan");
  const { parseSearch } = await import("../../../src/markdown/search/query");
  const index = vault();
  index.setMetadata(
    "folder/Note.md",
    metadata("---\npriority: 3\n---\n#Project/notes"),
  );
  index.setMetadata("other/A #.md", metadata("#unrelated"));
  const query = "tag:project [priority:>2]";
  const needs = queryRequirements(parseSearch(query));
  assert.deepEqual(needs, { text: false, metadata: true });
  const worker: SearchEvaluator = {
    ready: Promise.resolve(),
    includesFiles: false,
    requiresText: needs.text,
    requiresMetadata: needs.metadata,
    stopped: false,
    matches: async (doc) => compileSearch(query)(doc),
    dispose: async () => {},
  };
  const result = await searchVault({
    vault: index,
    source: "file:///vault/folder/Note.md",
    query,
    worker,
    token: new CancelToken(),
    read: async () => {
      throw new Error("Indexed predicates must not read notes");
    },
  });
  assert.equal(result.unreadable, 0);
  assert.deepEqual(
    result.results.map((item) => item.path),
    ["folder/Note.md"],
  );
  assert.equal(result.results[0]?.matches, undefined);
  assert.equal(
    queryRequirements(parseSearch("path:folder OR file:Note")).text,
    false,
  );
  assert.equal(queryRequirements(parseSearch("tag:(content:body)")).text, true);
  assert.equal(queryRequirements(parseSearch("block:(file:Note)")).text, true);
  assert.equal(
    queryRequirements(parseSearch("path:(line:folder)")).text,
    false,
  );
});

test("searchVault emits partial snapshots as matches accumulate", async () => {
  const worker: SearchEvaluator = {
    ready: Promise.resolve(),
    includesFiles: false,
    requiresText: true,
    requiresMetadata: false,
    stopped: false,
    matches: async (doc) => compileSearch("content:meeting")(doc),
    dispose: async () => {},
  };
  const partials: { results: string[]; unreadable: number }[] = [];
  const result = await searchVault({
    vault: vault(),
    source: "file:///vault/folder/Note.md",
    query: "content:meeting",
    worker,
    token: new CancelToken(),
    read: async (uri: string) => {
      // Yield so the throttle window can elapse between documents.
      await new Promise((resolve) => setTimeout(resolve, 40));
      return uri.endsWith("canvas") ? "{broken" : "Meeting";
    },
    onPartial: (snapshot) =>
      partials.push({
        results: snapshot.results.map((item) => item.path),
        unreadable: snapshot.unreadable,
      }),
  });
  assert.equal(result.unreadable, 1);
  assert.ok(partials.length >= 1);
  assert.deepEqual(partials.at(-1), {
    results: ["folder/Note.md", "other/A #.md"],
    unreadable: 1,
  });
  assert.deepEqual(
    result.results.map((item) => item.path),
    ["other/A #.md", "folder/Note.md"],
  );
});
