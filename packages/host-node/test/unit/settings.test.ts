import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type {
  ContributedSetting,
  HostSettings,
} from "@workshop/markdown/portable";
import { createNodePlatform } from "../../src/host/node-platform";
import { createHostSettings, SETTINGS_FILE } from "../../src/host/settings";

/** Settings kept in `dir`, as the Node host keeps them. */
async function nodeSettings(
  contributed: readonly ContributedSetting[],
  dir: string,
): Promise<HostSettings> {
  const { store } = createNodePlatform({ data: dir, workers: "" });
  return createHostSettings({
    contributed,
    store,
    saved: await store.read(SETTINGS_FILE),
  });
}

const contributed = [
  { key: "lumiere.markdown.preset", schema: { default: "obsidian" } },
  {
    key: "lumiere.markdown.editor.readableLineLength",
    schema: { default: true },
  },
];

test("contributed defaults apply, and a reader's change is kept and announced", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "lumiere-settings-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, "settings.json");
  const settings = await nodeSettings(contributed, dir);
  assert.equal(settings.get("preset", "minimal"), "obsidian");
  assert.equal(settings.get("unknown.key", 3), 3);

  let changes = 0;
  settings.onChange(() => changes++);
  assert.equal(
    await settings.access.update("editor.readableLineLength", false),
    "user",
  );
  assert.equal(changes, 1);
  assert.equal(settings.get("editor.readableLineLength", true), false);
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")), {
    "lumiere.markdown.editor.readableLineLength": false,
  });

  const reopened = await nodeSettings(contributed, dir);
  assert.equal(reopened.get("editor.readableLineLength", true), false);
  assert.equal(
    reopened.forNote({
      id: "n",
      uri: "file:///n.md",
      version: 1,
      isDirty: false,
      isUntitled: false,
      eol: "\n",
      getText: () => "",
      save: async () => true,
    }).preset,
    "obsidian",
  );
});

test("a damaged settings file reads as no changes", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "lumiere-settings-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, "settings.json");
  await import("node:fs/promises").then((fs) => fs.writeFile(file, "{oops"));
  const settings = await nodeSettings(contributed, dir);
  assert.equal(settings.get("preset", "minimal"), "obsidian");
});

test("a plugin this host cannot serve is off by default; the others keep theirs", async () => {
  const { servedDefaults } = await import("../../src/host/settings");
  const contributed = [
    {
      key: "lumiere.markdown.plugins.gitBlame.enabled",
      schema: { type: "boolean", default: true },
    },
    {
      key: "lumiere.markdown.plugins.graph.enabled",
      schema: { type: "boolean", default: true },
    },
    {
      key: "lumiere.markdown.plugins.outline.enabled",
      schema: { type: "boolean", default: true },
    },
    {
      key: "lumiere.markdown.gitBlame.delay",
      schema: { type: "number", default: 500 },
    },
  ];
  const served = servedDefaults(contributed as never);
  const defaults = Object.fromEntries(
    served.map((setting) => [setting.key, setting.schema.default]),
  );
  assert.deepEqual(defaults, {
    "lumiere.markdown.plugins.gitBlame.enabled": true,
    "lumiere.markdown.plugins.graph.enabled": false,
    "lumiere.markdown.plugins.outline.enabled": true,
    "lumiere.markdown.gitBlame.delay": 500,
  });
  // A host without Git turns Git blame off by default.
  const withoutGit = servedDefaults(contributed as never, []);
  assert.equal(withoutGit[0]?.schema.default, false);
});
