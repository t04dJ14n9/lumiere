import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

test("generated VS Code test cache is ignored and never tracked", () => {
  assert.equal(
    execFileSync("git", ["ls-files", "--", ".vscode-test"], {
      encoding: "utf8",
    }),
    "",
  );
  const ignored = readFileSync(".gitignore", "utf8").split("\n");
  assert.ok(
    ignored.includes(".vscode-test") || ignored.includes(".vscode-test/"),
  );
});

test("no two tracked paths differ only by letter case", () => {
  // macOS and Windows file systems cannot check out both.
  const paths = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
  const seen = new Map<string, string>();
  const collisions: string[] = [];
  for (const path of paths) {
    const key = path.toLowerCase();
    const other = seen.get(key);
    if (other !== undefined && other !== path) {
      collisions.push(`${other} and ${path}`);
    }
    seen.set(key, path);
  }
  assert.deepEqual(collisions, []);
});
