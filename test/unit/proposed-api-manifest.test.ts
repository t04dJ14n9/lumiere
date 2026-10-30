import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("enables custom text editor navigation in the extension manifest", () => {
  const manifest = JSON.parse(readFileSync("package.json", "utf8")) as {
    enabledApiProposals?: unknown;
  };
  assert.ok(
    Array.isArray(manifest.enabledApiProposals) &&
      manifest.enabledApiProposals.includes("customTextEditorNavigation"),
  );
});
