import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("starts early enough to migrate Markdown associations before Search opens", () => {
  const manifest = JSON.parse(readFileSync("package.json", "utf8")) as {
    activationEvents?: unknown;
    enabledApiProposals?: unknown;
  };
  assert.ok(
    Array.isArray(manifest.activationEvents) &&
      manifest.activationEvents.includes("workspaceContains:**/*.md"),
  );
  assert.ok(
    !Array.isArray(manifest.enabledApiProposals) ||
      !manifest.enabledApiProposals.includes("customTextEditorNavigation"),
    "installed VSIX extensions cannot use this proposed API",
  );
});
