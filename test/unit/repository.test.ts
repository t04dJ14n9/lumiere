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
