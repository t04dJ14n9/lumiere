import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import { test } from "node:test";
import type * as vscode from "vscode";
import { nodeDigests, nodeWorkerLauncher } from "@workshop/platform/node";
import type { Configuration } from "../../../src/shared/configuration";

const resolver = Module as unknown as {
  _resolveFilename(request: string, ...rest: unknown[]): string;
};
const resolve = resolver._resolveFilename;
resolver._resolveFilename = function (request, ...rest) {
  return request === "vscode"
    ? path.join(import.meta.dirname, "support/vscode-root-fake.ts")
    : resolve.call(this, request, ...rest);
};

test("a vault at the root of a file system lists its notes", async () => {
  const { createVaultSystem } = await import("../../../src/host/vault-system");
  const system = createVaultSystem(
    {} as vscode.ExtensionContext,
    { digests: nodeDigests, workers: nodeWorkerLauncher("/nowhere") },
    {} as Configuration,
  );
  // Vault roots carry no trailing slash, so this root has no path at all.
  const { files } = await system.list("demo:", 10);
  assert.deepEqual(files.map((file) => file.path).sort(), [
    "Welcome.md",
    "notes/Second.md",
  ]);
});
