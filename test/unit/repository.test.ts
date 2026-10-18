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

test("Markdown Workshop opens PDF links with PDF Workshop's Open Location command", async () => {
  const { OPEN_LOCATION_COMMAND_ID } =
    await import("../../packages/pdf/src/extension/plugins/pdf/registered-commands");
  const navigation = readFileSync(
    "packages/markdown/src/host/navigation.ts",
    "utf8",
  );
  assert.match(
    navigation,
    new RegExp(`PDF_OPEN_LOCATION_COMMAND = "${OPEN_LOCATION_COMMAND_ID}"`),
  );
});

test("the Settings editor is opened only through each product's settings-editor helper", () => {
  // Run directly, these commands send the whole Settings editor back to the
  // extension as JSON, which froze Cursor's window (settings-editor.ts).
  const helpers = new Set([
    "packages/markdown/src/host/settings-editor.ts",
    "packages/pdf/src/extension/settings-editor.ts",
  ]);
  const sources = execFileSync(
    "git",
    ["ls-files", "-z", "--", "packages/*/src/**.ts", "src/**.ts"],
    { encoding: "utf8" },
  )
    .split("\0")
    .filter((path) => path && !path.endsWith(".test.ts"));
  const direct = sources.filter(
    (path) =>
      !helpers.has(path) &&
      /workbench\.action\.(openSettings|openGlobalSettings|openWorkspaceSettings|openFolderSettings)\b/u.test(
        readFileSync(path, "utf8"),
      ),
  );
  assert.deepEqual(direct, []);
});

test("no extension source finds files next to itself, since the bundle moves it", () => {
  // Everything runs from dist/extension.js, but each product's assets are in
  // dist/markdown or dist/pdf; a __dirname path broke the vault worker once.
  const sources = execFileSync(
    "git",
    ["ls-files", "-z", "--", "packages/*/src/**.ts", "src/**.ts"],
    { encoding: "utf8" },
  )
    .split("\0")
    .filter((path) => path && !path.endsWith(".test.ts"));
  const relative = sources.filter((path) =>
    /\b__(?:dirname|filename)\b/u.test(readFileSync(path, "utf8")),
  );
  assert.deepEqual(relative, []);
});
