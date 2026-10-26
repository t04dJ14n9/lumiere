import assert from "node:assert/strict";
import test from "node:test";
import type { VaultCodeTrust } from "@workshop/markdown/portable";
import { noVaultCode } from "../../src/host/inert";
import { nodeFiles } from "../../src/host/node-platform";
import { createHostWorkspace } from "../../src/host/workspace";

test("an embedder that cannot ask runs no vault code, and asks no one", async () => {
  assert.equal(noVaultCode.answer("file:///vault"), false);
  assert.equal(await noVaultCode.request("file:///vault", ["hello"]), false);
});

test("the workspace answers about a vault's code with its embedder's answer", () => {
  const embedder: VaultCodeTrust = {
    answer: (vault) => vault === "file:///mine",
    request: async () => true,
    onDidChange: () => () => {},
  };
  const workspace = createHostWorkspace({
    files: nodeFiles,
    roots: () => [],
    vaultCode: embedder,
  });
  assert.equal(workspace.vaultCode, embedder);
  assert.equal(workspace.isTrusted(), true);
});
