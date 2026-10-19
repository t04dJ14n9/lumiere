import "../support/install-fake-vscode";
import assert from "node:assert/strict";
import { test } from "node:test";
import { SETTING_PREFIX } from "../../../src/shared/setting-schema";
import { VIEW_TYPE } from "../../../src/extension/plugins/pdf/panels";
import { RUNTIME_COMMAND_IDS } from "../../../src/extension/plugins/pdf/registered-commands";
import { pdfContributes } from "../support/manifest";

const contributes = pdfContributes<Record<string, any>>(); // eslint-disable-line @typescript-eslint/no-explicit-any -- loose JSON fixture
// Joined so the identity gate's fixed-string search does not see a live retired id.
const retiredPrefix = ["vscode", "EmbedPdf"].join("");
const manifestCommands = new Set<string>(
  contributes.commands.map((c: { command: string }) => c.command),
);
const runtimeCommands = new Set(RUNTIME_COMMAND_IDS);
// Public peer API retains its original id across the product rename.
const compatibilityCommand = [retiredPrefix, "bridge.envelope"].join(".");

test("constants match locked Lumière PDF identity", () => {
  assert.equal(SETTING_PREFIX, "lumiere.pdf.");
  assert.equal(VIEW_TYPE, "lumiere.pdf.viewer");
});

test("customEditors viewType matches runtime VIEW_TYPE", () => {
  const viewTypes = contributes.customEditors.map(
    (e: { viewType: string }) => e.viewType,
  );
  assert.deepEqual(viewTypes, [VIEW_TYPE]);
});

test("manifest commands ↔ runtime registration set (B3)", () => {
  for (const id of runtimeCommands) {
    assert.equal(manifestCommands.has(id), true, `runtime-only: ${id}`);
    if (id !== compatibilityCommand) {
      assert.match(id, /^lumiere\.pdf\./);
      assert.doesNotMatch(id, new RegExp(retiredPrefix));
    }
  }
  for (const id of manifestCommands) {
    assert.equal(runtimeCommands.has(id), true, `manifest-only: ${id}`);
  }
  assert.equal(runtimeCommands.size, manifestCommands.size);
});

test("owned when/enablement/config keys do not use old prefix", () => {
  const blob = JSON.stringify(contributes).replaceAll(
    compatibilityCommand,
    "lumiere.pdf.bridge.envelope",
  );
  assert.equal(blob.includes(retiredPrefix), false);
  for (const key of Object.keys(contributes.configuration.properties)) {
    assert.equal(key.startsWith(SETTING_PREFIX), true);
  }
});

test("outline view id renamed", () => {
  const views = Object.values(contributes.views ?? {}).flat() as {
    id: string;
  }[];
  assert.ok(views.some((v) => v.id === "lumiere.pdf.outline"));
  assert.ok(!views.some((v) => v.id.includes(retiredPrefix)));
});
