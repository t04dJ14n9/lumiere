import test from "node:test";
import assert from "node:assert/strict";
import {
  createCommandPalette,
  paletteCommands,
  type CommandContribution,
} from "../../src/host/command-palette";
import { ContextKeys } from "../../src/host/context-menu";
import { createHostCommands } from "../../src/host/services";
import { createNodeSettings } from "../../src/host/settings";

const EDITOR = "lumiere.markdown.editor";
const contributions: CommandContribution[] = [
  {
    command: "lumiere.markdown.toggleBold",
    title: "Toggle Bold",
    category: "Lumière",
    when: "activeCustomEditorId == 'lumiere.markdown.editor' && lumiere.markdown.plugin.formatting",
  },
  {
    command: "lumiere.markdown.scratch.create",
    title: "Create Scratch Note",
    category: "Lumière",
    when: "config.lumiere.markdown.preset != 'minimal' && config.lumiere.markdown.plugins.scratch.enabled",
  },
  {
    command: "lumiere.markdown.backlinks.sortByAlphabetical",
    title: "✓ File name (A to Z)",
    category: "Lumière",
    when: "false",
  },
];

test("paletteCommands filters by registration and when-clause", () => {
  const registered = new Set([
    "lumiere.markdown.toggleBold",
    "lumiere.markdown.scratch.create",
    "lumiere.markdown.backlinks.sortByAlphabetical",
  ]);
  const keys: Record<string, unknown> = {
    activeCustomEditorId: EDITOR,
    "lumiere.markdown.plugin.formatting": true,
    "config.lumiere.markdown.preset": "default",
    "config.lumiere.markdown.plugins.scratch.enabled": true,
  };
  assert.deepEqual(
    paletteCommands(
      contributions,
      (key) => keys[key],
      (id) => registered.has(id),
    ).map((item) => item.title),
    ["Toggle Bold", "Create Scratch Note"],
  );
});

test("createCommandPalette scopes editor commands to active panel and runs offered commands", async () => {
  const keys = new ContextKeys();
  const commands = createHostCommands(() => {}, keys);
  const ran: string[] = [];
  for (const item of contributions) {
    commands.register(item.command, () => {
      ran.push(item.command);
    });
  }
  await commands.execute(
    "setContext",
    "lumiere.markdown.plugin.formatting",
    true,
  );
  const settings = createNodeSettings({
    contributed: [
      { key: "lumiere.markdown.preset", schema: { default: "default" } },
      {
        key: "lumiere.markdown.plugins.scratch.enabled",
        schema: { default: true },
      },
    ],
    file: "/tmp/nonexistent-palette-settings.json",
  });
  let active = false;
  const palette = createCommandPalette({
    contributions,
    keys,
    settings,
    panels: { active: () => (active ? ({} as never) : undefined) },
    commands,
    viewType: EDITOR,
    log: () => {},
  });

  // Without an active editor panel, only workspace-level commands appear.
  assert.deepEqual(
    palette.list().map((item) => item.command),
    ["lumiere.markdown.scratch.create"],
  );
  assert.equal(await palette.run("lumiere.markdown.toggleBold"), false);

  // With an active editor panel, editor commands appear and can run.
  active = true;
  assert.deepEqual(
    palette.list().map((item) => item.command),
    ["lumiere.markdown.toggleBold", "lumiere.markdown.scratch.create"],
  );
  assert.equal(await palette.run("lumiere.markdown.toggleBold"), true);
  assert.equal(
    await palette.run("lumiere.markdown.backlinks.sortByAlphabetical"),
    false,
  );
  assert.deepEqual(ran, ["lumiere.markdown.toggleBold"]);
});
