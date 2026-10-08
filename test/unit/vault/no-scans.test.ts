import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

// DESIGN §12: features ask the vault index for files, links and tags. Only the
// vault's file system adapter lists folders; a feature that scans on its own
// is slow in a large vault and disagrees with the index about what exists.
const LISTER = "src/host/vault-system.ts";
const SCANS =
  /\b(findFiles|readDirectory|readdir(Sync)?|opendir(Sync)?|glob)\s*\(/;

test("only the vault's file system adapter lists folders", () => {
  const scanners = readdirSync("src", { recursive: true, encoding: "utf8" })
    .filter((path) => path.endsWith(".ts") && !path.endsWith(".test.ts"))
    .map((path) => `src/${path}`)
    .filter((path) => path !== LISTER)
    .filter((path) => SCANS.test(readFileSync(path, "utf8")));
  assert.deepEqual(scanners, []);
});
