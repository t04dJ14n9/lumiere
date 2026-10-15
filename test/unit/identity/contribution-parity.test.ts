import "../support/install-fake-vscode";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { SETTING_PREFIX } from "../../../src/shared/setting-schema";
import { EXTENSION_ID } from "../../../src/extension/settings";
import { VIEW_TYPE } from "../../../src/extension/plugins/pdf/panels";
import { RUNTIME_COMMAND_IDS } from "../../../src/extension/plugins/pdf/registered-commands";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const contributes = pkg.contributes;
// Joined so the identity gate's fixed-string search does not see a live retired id.
const retiredPrefix = ["vscode", "EmbedPdf"].join("");
const manifestCommands = new Set<string>(
  contributes.commands.map((c: { command: string }) => c.command),
);
const runtimeCommands = new Set(RUNTIME_COMMAND_IDS);

test("constants match locked PDF Workshop identity", () => {
  assert.equal(SETTING_PREFIX, "pdfWorkshop.");
  assert.equal(EXTENSION_ID, "t04dj14n9.vscode-pdf-workshop");
  assert.equal(VIEW_TYPE, "pdfWorkshop.viewer");
});

test("customEditors viewType matches runtime VIEW_TYPE", () => {
  const viewTypes = contributes.customEditors.map((e: { viewType: string }) => e.viewType);
  assert.deepEqual(viewTypes, [VIEW_TYPE]);
});

test("manifest commands ↔ runtime registration set (B3)", () => {
  for (const id of runtimeCommands) {
    assert.equal(manifestCommands.has(id), true, `runtime-only: ${id}`);
    assert.match(id, /^pdfWorkshop\./);
    assert.doesNotMatch(id, new RegExp(retiredPrefix));
  }
  for (const id of manifestCommands) {
    assert.equal(runtimeCommands.has(id), true, `manifest-only: ${id}`);
  }
  assert.equal(runtimeCommands.size, manifestCommands.size);
});

test("owned when/enablement/config keys do not use old prefix", () => {
  const blob = JSON.stringify(contributes);
  assert.equal(blob.includes(retiredPrefix), false);
  for (const key of Object.keys(contributes.configuration.properties)) {
    assert.equal(key.startsWith(SETTING_PREFIX), true);
  }
});

test("outline view id renamed", () => {
  const views = Object.values(contributes.views ?? {}).flat() as { id: string }[];
  assert.ok(views.some((v) => v.id === "pdfWorkshop.outline"));
  assert.ok(!views.some((v) => v.id.includes(retiredPrefix)));
});
