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
    stopped: false,
    matches: async (doc) => compileSearch("content:meeting")(doc),
    dispose: async () => {},
  };
  const input = {
    vault: vault(),
    source: "file:///vault/folder/Note.md",
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
  assert.equal(reads.length, 3);
  await assert.rejects(
    searchVault({ ...input, source: "file:///outside/Note.md" }),
    /Unknown search source/,
  );
  const token = new CancelToken();
  token.cancel();
  await assert.rejects(searchVault({ ...input, token }), { code: "Cancelled" });
});
