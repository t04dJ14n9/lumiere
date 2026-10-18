import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { build } from "esbuild";
import { browserGuard, browserHost } from "../../scripts/browser-bundle.mjs";

const root = path.resolve(import.meta.dirname, "..", "..");

test("the browser's extension host bundles with no Node built-in, requiring only vscode", async () => {
  const result = await build({
    ...browserHost(root),
    write: false,
    outfile: "extension.js",
    logLevel: "silent",
  });
  const code = result.outputFiles![0]!.text;
  const required = new Set(
    [...code.matchAll(/\brequire\("([^"]+)"\)/g)].map((match) => match[1]),
  );
  assert.deepEqual([...required], ["vscode"]);
  // The desktop's parts stay out: Git, the agent bridge, region snapshots.
  const inputs = Object.keys(result.metafile!.inputs).join("\n");
  for (const desktop of [
    "markdown/src/host/git.ts",
    "pdf/src/extension/plugins/agentBridge/plugin.ts",
    "pdf/src/extension/plugins/pdfRegions/plugin.ts",
    "platform/src/node/",
  ]) {
    assert.ok(!inputs.includes(desktop), desktop);
  }
});

test("the guard refuses a Node built-in and names who imported it", async () => {
  await assert.rejects(
    build({
      stdin: { contents: 'import "node:fs"; import "path";', loader: "ts" },
      bundle: true,
      platform: "browser",
      write: false,
      logLevel: "silent",
      plugins: [browserGuard],
    }),
    (error: { errors: { text: string }[] }) =>
      error.errors.length === 2 &&
      error.errors.every((item) => /is a Node built-in/.test(item.text)),
  );
});
