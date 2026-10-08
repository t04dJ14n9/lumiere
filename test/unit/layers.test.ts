import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
for (const [name, source, diagnostic] of [
  ["DOM", "export const body = document.body;", "Cannot find name"],
  [
    "VS Code",
    "import * as vscode from 'vscode'; export { vscode };",
    "not assignable to type",
  ],
  [
    "Node",
    "import * as fs from 'node:fs'; export { fs };",
    "not assignable to type",
  ],
]) {
  test(`pure tsconfig rejects ${name}`, () => {
    const dir = mkdtempSync(join(tmpdir(), "mw-layer-"));
    try {
      writeFileSync(join(dir, "fixture.ts"), source!);
      writeFileSync(
        join(dir, "tsconfig.json"),
        JSON.stringify({
          extends: resolve("tsconfig.json"),
          include: ["./fixture.ts"],
        }),
      );
      const result = spawnSync(
        process.execPath,
        [
          require.resolve("typescript/bin/tsc"),
          "-p",
          join(dir, "tsconfig.json"),
        ],
        { encoding: "utf8" },
      );
      assert.equal(result.status, 2, result.stdout + result.stderr);
      assert.ok(result.stdout.includes(diagnostic!), result.stdout);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
