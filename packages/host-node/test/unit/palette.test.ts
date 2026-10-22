import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import * as path from "node:path";
import { themeMessage, vscodeVariables, type Palette } from "../../src/palette";

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

const palette = (dark: boolean): Palette => ({
  dark,
  fontFamily: "Host Sans",
  background: "role:background",
  surface: "role:surface",
  field: "role:field",
  foreground: "role:foreground",
  muted: "role:muted",
  faint: "role:faint",
  border: "role:border",
  accent: "role:accent",
  hover: "role:hover",
  active: "role:active",
  selection: "role:selection",
  button: "role:button",
  buttonForeground: "role:buttonForeground",
  buttonHover: "role:buttonHover",
  error: "role:error",
  warning: "role:warning",
  success: "role:success",
});

test("every VS Code variable the editor reads gets a value from the palette", () => {
  const variables = vscodeVariables(palette(false));
  const missing = variablesTheEditorUses().filter(
    (name) => !(name in variables),
  );
  assert.deepEqual(missing, []);
  assert.equal(variables["--vscode-editor-background"], "role:background");
  assert.equal(variables["--vscode-textLink-foreground"], "role:accent");
  assert.equal(variables["--vscode-font-family"], "Host Sans");
});

test("colours no role covers follow the palette's light or dark", () => {
  assert.equal(
    vscodeVariables(palette(false))["--vscode-charts-red"],
    "#e51400",
  );
  assert.equal(
    vscodeVariables(palette(true))["--vscode-charts-red"],
    "#f14c4c",
  );
});

test("an empty role leaves the variable to the editor's own fallback", () => {
  const variables = vscodeVariables({ ...palette(false), background: "" });
  assert.equal("--vscode-editor-background" in variables, false);
});

test("a theme message carries the palette's darkness and variables", () => {
  const message = themeMessage(palette(true));
  assert.equal(message.lumiere, "theme");
  assert.equal(message.dark, true);
  assert.equal(
    message.variables["--vscode-editor-foreground"],
    "role:foreground",
  );
});
