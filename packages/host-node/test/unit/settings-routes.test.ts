import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { ContributedSetting } from "@workshop/markdown/portable";
import { createNodeSettings } from "../../src/host/settings";
import {
  createSettingsRoutes,
  describeKey,
} from "../../src/host/settings-routes";
import { matchesSearch, type SettingItem } from "../../src/settings";

const contributed: ContributedSetting[] = [
  {
    key: "lumiere.markdown.editor.fontSize",
    schema: {
      type: "number",
      minimum: 8,
      maximum: 48,
      default: 16,
      description: "Font size.",
    },
  },
  {
    key: "lumiere.markdown.plugins.vim.enabled",
    schema: {
      type: "boolean",
      default: false,
      description: "Vim in the Markdown editor.",
    },
  },
  {
    key: "lumiere.markdown.plugins.cursorBridge.enabled",
    schema: { type: "boolean", default: true },
  },
  {
    key: "lumiere.markdown.backlinks.sortOrder",
    schema: {
      enum: ["alphabetical", "byModifiedTime"],
      default: "alphabetical",
    },
  },
];
const titles = new Map([
  ["vim", "Vim"],
  ["backlinks", "Backlinks"],
]);

test("a key's group is its plugin's title, else its first segment, else General", () => {
  assert.deepEqual(describeKey("plugins.vim.enabled", titles), {
    category: "Vim",
    prefix: "Vim",
    name: "Enabled",
  });
  assert.deepEqual(describeKey("backlinks.sortOrder", titles), {
    category: "Backlinks",
    prefix: "Backlinks",
    name: "Sort Order",
  });
  assert.equal(
    describeKey("files.newNoteFolder", titles).name,
    "New Note Folder",
  );
  assert.equal(describeKey("files.newNoteFolder", titles).category, "Files");
  assert.equal(describeKey("debug", titles).category, "General");
  // A key that spells a plugin's title joins that plugin's group.
  assert.equal(
    describeKey(
      "copyLinkForAgent.format",
      new Map([["agentBridge", "Copy Link for Agent"]]),
    ).category,
    "Copy Link for Agent",
  );
});

async function serve(t: test.TestContext) {
  const dir = await mkdtemp(path.join(tmpdir(), "lumiere-settings-"));
  const file = path.join(dir, "settings.json");
  const settings = createNodeSettings({ contributed, file });
  const routes = createSettingsRoutes(
    settings,
    titles,
    new Set(["lumiere.markdown.plugins.cursorBridge.enabled"]),
  );
  const server = createServer((req, res) => {
    void routes
      .handle(req, res, "")
      .then((handled) => handled || res.writeHead(404).end());
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.close();
    await rm(dir, { recursive: true, force: true });
  });
  const { port } = server.address() as { port: number };
  const url = `http://127.0.0.1:${port}/`;
  const post = (body: unknown) =>
    fetch(url, { method: "POST", body: JSON.stringify(body) });
  return { settings, file, url, post };
}

test("the page lists every setting with its value, and a change reaches the plugins", async (t) => {
  const { settings, file, url, post } = await serve(t);
  const listed = (await (await fetch(url)).json()) as { items: SettingItem[] };
  assert.deepEqual(
    listed.items.map((item) => [
      item.key,
      item.category,
      item.value,
      item.modified,
    ]),
    [
      ["lumiere.markdown.editor.fontSize", "Editor", 16, false],
      ["lumiere.markdown.plugins.vim.enabled", "Vim", false, false],
      [
        "lumiere.markdown.backlinks.sortOrder",
        "Backlinks",
        "alphabetical",
        false,
      ],
    ],
  );
  let heard = 0;
  settings.onChange(() => heard++);
  const changed = await post({
    key: "lumiere.markdown.editor.fontSize",
    value: 20,
  });
  assert.equal(changed.status, 200);
  assert.deepEqual(((await changed.json()) as SettingItem).value, 20);
  assert.equal(settings.get("editor.fontSize", 0), 20);
  assert.ok(heard > 0);
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")), {
    "lumiere.markdown.editor.fontSize": 20,
  });

  const reset = await post({
    key: "lumiere.markdown.editor.fontSize",
    reset: true,
  });
  assert.equal(((await reset.json()) as SettingItem).modified, false);
  assert.equal(settings.get("editor.fontSize", 0), 16);
});

test("a value the schema refuses, or a key that is not Lumière's, is not written", async (t) => {
  const { settings, post } = await serve(t);
  const tooBig = await post({
    key: "lumiere.markdown.editor.fontSize",
    value: 99,
  });
  assert.equal(tooBig.status, 400);
  assert.match(((await tooBig.json()) as { error: string }).error, /8 to 48/);
  assert.equal(
    (
      await post({
        key: "lumiere.markdown.backlinks.sortOrder",
        value: "random",
      })
    ).status,
    400,
  );
  assert.equal((await post({ key: "editor.fontSize", value: 99 })).status, 400);
  assert.equal(
    (await post({ key: "workbench.colorTheme", value: "x" })).status,
    400,
  );
  assert.equal(settings.get("editor.fontSize", 0), 16);
});

test("search matches every word, and @modified keeps changed settings", () => {
  const item: SettingItem = {
    key: "lumiere.markdown.editor.fontSize",
    category: "Editor",
    label: { prefix: "Editor", name: "Font Size" },
    description: "Font size of the note text in pixels.",
    schema: { type: "number" },
    value: 20,
    modified: true,
  };
  assert.equal(matchesSearch(item, "font pixels"), true);
  assert.equal(matchesSearch(item, "FONT"), true);
  assert.equal(matchesSearch(item, "font vim"), false);
  assert.equal(matchesSearch(item, "@modified"), true);
  assert.equal(
    matchesSearch({ ...item, modified: false }, "@modified font"),
    false,
  );
  assert.equal(matchesSearch(item, ""), true);
});

test("a setting that means nothing in this host is neither listed nor written", async (t) => {
  const { url, post } = await serve(t);
  const listed = (await (await fetch(url)).json()) as { items: SettingItem[] };
  assert.ok(!listed.items.some((item) => item.key.includes("cursorBridge")));
  const written = await post({
    key: "lumiere.markdown.plugins.cursorBridge.enabled",
    value: false,
  });
  assert.equal(written.status, 400);
});
