import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

// DESIGN §12: features ask the vault index for files, links and tags. Only the
// vault's file system adapter walks the vault. A feature that scans on its
// own is slow in a large vault and disagrees with the index about what exists.
// workspace-files lists one directory the user just named (assets, scratch or
// exports). It does not walk the vault or replace the index. ide-context-temp
// lists the agents' temp folder, outside every vault.
const LISTERS = new Set([
  "src/host/vault-system.ts",
  "src/host/workspace-files.ts",
  "src/host/ide-context-temp.ts",
]);
const SCANS =
  /\b(findFiles|readDirectory|readdir(Sync)?|opendir(Sync)?|glob)\s*\(/;

test("only the vault's file system adapter lists folders", () => {
  const scanners = readdirSync("src", { recursive: true, encoding: "utf8" })
    .filter((path) => path.endsWith(".ts") && !path.endsWith(".test.ts"))
    .map((path) => `src/${path}`)
    .filter((path) => !LISTERS.has(path))
    .filter((path) => SCANS.test(readFileSync(path, "utf8")));
  assert.deepEqual(scanners, []);
});
