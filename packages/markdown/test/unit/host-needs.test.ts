import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { allManifests, settingsUnavailableIn } from "../../src/plugins/catalog";
import { settingNeeds } from "../../src/shared/host-needs";

const manifest = JSON.parse(
  readFileSync(new URL("../../../../package.json", import.meta.url), "utf8"),
) as {
  contributes: { configuration: { properties: Record<string, unknown> }[] };
};
const contributed = new Set(
  manifest.contributes.configuration.flatMap((section) =>
    Object.keys(section.properties),
  ),
);

test("outside VS Code and Cursor, their settings are not offered", () => {
  const hidden = settingsUnavailableIn([]);
  for (const key of [
    "lumiere.markdown.plugins.cursorBridge.enabled",
    "lumiere.markdown.plugins.ideContext.enabled",
    "lumiere.markdown.plugins.bridge.enabled",
    "lumiere.markdown.plugins.marp.enabled",
    "lumiere.markdown.marp.open",
    "lumiere.markdown.editor.reclaimTextEditor",
    "lumiere.markdown.editor.reclaimInPlaceTextEditor",
    "lumiere.markdown.editor.warmTextDocument",
    "lumiere.markdown.copyLinkForAgent.target",
    "lumiere.markdown.plugins.external",
    "lumiere.markdown.plugins.gitGutter.enabled",
    "lumiere.markdown.gitGutter.compareTo",
    "lumiere.markdown.gitDiffEditor.diffEditor",
    "lumiere.markdown.plugins.graph.enabled",
    "lumiere.markdown.graph.maxNodes",
  ]) {
    assert.ok(hidden.has(key), key);
  }
  for (const key of [
    "lumiere.markdown.plugins.agentBridge.enabled",
    "lumiere.markdown.editor.fontSize",
    "lumiere.markdown.editor.readableLineLength",
    "lumiere.markdown.outline.followCursor",
    "lumiere.markdown.plugins.vim.enabled",
  ]) {
    assert.ok(!hidden.has(key), key);
  }
});

test("a host that offers what they need shows them again", () => {
  assert.equal(settingsUnavailableIn(["workbench", "git", "panels"]).size, 0);
  const withGit = settingsUnavailableIn(["git"]);
  assert.ok(!withGit.has("lumiere.markdown.plugins.gitGutter.enabled"));
  // The rendered diff opens from VS Code's Source Control: Git alone is not enough.
  assert.ok(withGit.has("lumiere.markdown.plugins.gitDiffEditor.enabled"));
});

test("every setting with needs is one package.json contributes, so none escapes by a typo", () => {
  for (const key of settingNeeds(allManifests()).keys()) {
    assert.ok(contributed.has(key), `${key} is not a contributed setting`);
  }
});

test("a plugin whose needs a host cannot meet stays off there, with nothing else", async () => {
  const { switchesUnavailableIn } = await import("../../src/plugins/catalog");
  const off = switchesUnavailableIn([]);
  for (const id of [
    "bridge",
    "cursorBridge",
    "gitBlame",
    "gitDiffEditor",
    "gitGutter",
    "gitInline",
    "graph",
    "ideContext",
    "marp",
  ]) {
    const key = `lumiere.markdown.plugins.${id}.enabled`;
    assert.ok(off.has(key), key);
    assert.ok(contributed.has(key), `${key} is a real setting`);
  }
  for (const id of ["outline", "backlinks", "formatting", "tables"]) {
    assert.ok(!off.has(`lumiere.markdown.plugins.${id}.enabled`), id);
  }
  // A host with Git keeps its Git plugins, not the ones needing more.
  const withGit = switchesUnavailableIn(["git"]);
  assert.ok(!withGit.has("lumiere.markdown.plugins.gitBlame.enabled"));
  assert.ok(withGit.has("lumiere.markdown.plugins.gitDiffEditor.enabled"));
});
