import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import * as path from "node:path";
import { vscodeVariables } from "../../src/webview/theme";

const repository = path.resolve(import.meta.dirname, "../../../..");

/** Every `--vscode-*` variable Lumière's editor styles and code read. */
function variablesTheEditorUses(): string[] {
  const files = execFileSync(
    "git",
    ["ls-files", "packages/markdown/src/*.css", "packages/markdown/src/*.ts"],
    { cwd: repository, encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean);
  const names = new Set<string>();
  for (const file of files) {
    const text = readFileSync(path.join(repository, file), "utf8");
    for (const match of text.matchAll(/var\((--vscode-[A-Za-z0-9-]+)/g)) {
      names.add(match[1]!);
    }
  }
  return [...names].sort();
}

const theme = (dark: boolean) => ({
  token: (name: string) => `token:${name}`,
  dark,
  fontFamily: "DSH Sans",
});

test("every VS Code variable the editor reads gets a value from DSH's theme", () => {
  const variables = vscodeVariables(theme(false));
  const missing = variablesTheEditorUses().filter(
    (name) => !(name in variables),
  );
  assert.deepEqual(missing, []);
  assert.equal(variables["--vscode-editor-background"], "token:bg-base");
  assert.equal(variables["--vscode-textLink-foreground"], "token:link");
  assert.equal(variables["--vscode-font-family"], "DSH Sans");
});

test("colours DSH has no token for follow its light or dark theme", () => {
  assert.equal(vscodeVariables(theme(false))["--vscode-charts-red"], "#e51400");
  assert.equal(vscodeVariables(theme(true))["--vscode-charts-red"], "#f14c4c");
});

test("a token DSH leaves unset leaves the variable to the editor's own fallback", () => {
  const variables = vscodeVariables({ ...theme(false), token: () => "" });
  assert.equal("--vscode-editor-background" in variables, false);
});
