import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { createNodeSettings } from "../../src/host/settings";

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
  const settings = createNodeSettings({ contributed, file });
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

  const reopened = createNodeSettings({ contributed, file });
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
  const settings = createNodeSettings({ contributed, file });
  assert.equal(settings.get("preset", "minimal"), "obsidian");
});
