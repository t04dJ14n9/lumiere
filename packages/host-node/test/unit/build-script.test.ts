import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(here, "../..");
const build = path.join(pkg, "scripts/build.mjs");

test("host-node build script exists and exits 0", () => {
  assert.equal(existsSync(build), true);
  const result = spawnSync(process.execPath, [build], {
    cwd: pkg,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
