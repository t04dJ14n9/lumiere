import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import Module from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { build } from "esbuild";
import type * as vscode from "vscode";
import { nodePlatform } from "@workshop/platform/node";
import { metadata } from "../../../src/markdown/metadata";
import type { Configuration } from "../../../src/shared/configuration";

const resolver = Module as unknown as {
  _resolveFilename(request: string, ...rest: unknown[]): string;
};
const resolve = resolver._resolveFilename;
resolver._resolveFilename = function (request, ...rest) {
  return request === "vscode"
    ? path.join(import.meta.dirname, "support/vscode-unused.ts")
    : resolve.call(this, request, ...rest);
};

// An installed extension's layout: the repository build copies Markdown
// Workshop's dist/ into dist/markdown/, beside the host bundle.
let extension: string;
before(async () => {
  extension = await mkdtemp(path.join(tmpdir(), "vault-worker-"));
  await build({
    entryPoints: ["src/workers/vault.ts"],
    outfile: path.join(extension, "dist/markdown/workers/vault.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node20",
    logLevel: "silent",
  });
});
after(() => rm(extension, { recursive: true, force: true }));

test("the vault parser runs in the worker the extension ships in dist/markdown/workers", async () => {
  const { createVaultSystem } = await import("../../../src/host/vault-system");
  const parser = createVaultSystem(
    {} as vscode.ExtensionContext,
    nodePlatform(extension),
    {} as Configuration,
  ).createParser();
  try {
    const text = "# Title\n\nSee [[Other note]] and #topic.\n";
    // Metadata crosses the worker boundary by structured clone.
    assert.deepEqual(await parser.parse(text), structuredClone(metadata(text)));
  } finally {
    parser.dispose();
  }
});
