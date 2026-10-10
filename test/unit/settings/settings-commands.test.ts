import test from "node:test";
import assert from "node:assert/strict";
import { Context } from "../../../src/kernel";
import { settingsHost } from "../../../src/plugins/settings/host";
import {
  DEFAULT_FONT_SIZE,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  EXTENSION_FILTER,
  checkFontSize,
  fontSizeArgument,
  toggles,
} from "../../../src/plugins/settings/commands";
import * as font from "../../../src/plugins/editor/font";
import settings from "../../../src/plugins/settings/manifest";
import type {
  SettingsAccess,
  SettingTarget,
} from "../../../src/shared/runtime";
import { fakeViews, workbenchWith } from "../views/fakes";

/** Layered settings: the workspace overrides the user's, as in VS Code. */
function layered(defaults: Record<string, unknown>) {
  const user = new Map<string, unknown>();
  const workspace = new Map<string, unknown>();
  const opened: string[] = [];
  const locate = (key: string): SettingTarget =>
    workspace.has(key) ? "workspace" : "user";
  const access: SettingsAccess = {
    inspect: (key) => ({
      target: locate(key),
      value: workspace.get(key) ?? user.get(key) ?? defaults[key],
    }),
    async update(key, value) {
      const target = locate(key);
      (target === "workspace" ? workspace : user).set(key, value);
      return target;
    },
    contributed: () => [],
    async openUi(query) {
      opened.push(query);
    },
  };
  return { access, user, workspace, opened };
}

async function run(
  store: ReturnType<typeof layered>,
  typed?: string | undefined,
) {
  const fake = fakeViews();
  const views = {
    ...fake.views,
    input: async (options: { value: string }) => {
      fake.prompts.push(options.value);
      return typed;
    },
  };
  const workbench = workbenchWith(views);
  workbench.settings = store.access;
  const informed: string[] = [];
  workbench.inform = (message) => informed.push(message);
  const root = Context.create({});
  root.provide("workbench", workbench);
  root.plugin(settingsHost);
  await root.settled();
  return { fake, root, informed };
}

test("the manifest's commands are the ones the plugin registers", async () => {
  const store = layered({});
  const { fake, root } = await run(store);
  assert.deepEqual(
    [...fake.commands.keys()].sort(),
    settings.contributes.commands
      .map((command) => `markdownWorkbench.${command.id}`)
      .sort(),
  );
  await root.dispose();
});

test("Open Settings filters the Settings UI to this extension", async () => {
  const store = layered({});
  const { fake, root } = await run(store);
  await fake.commands.get("markdownWorkbench.openSettings")!();
  assert.deepEqual(store.opened, ["@ext:t04dj14n9.vscode-markdown-workbench"]);
  assert.equal(EXTENSION_FILTER, store.opened[0]);
  await root.dispose();
});

test("each toggle flips the setting the Settings UI shows, in the workspace when it sets it, else the user's", async () => {
  const defaults = Object.fromEntries(
    toggles.map((toggle) => [toggle.key, toggle.fallback]),
  );
  const store = layered(defaults);
  const { fake, root, informed } = await run(store);
  for (const toggle of toggles) {
    const command = fake.commands.get(`markdownWorkbench.${toggle.command}`)!;
    await command();
    assert.equal(store.user.get(toggle.key), !toggle.fallback, toggle.key);
    assert.equal(store.workspace.has(toggle.key), false, toggle.key);
    // Set in the workspace (as the Settings UI would): the next run changes that.
    store.workspace.set(toggle.key, true);
    await command();
    assert.equal(store.workspace.get(toggle.key), false, toggle.key);
    // An edit elsewhere is what the next run reads: nothing is cached.
    store.workspace.set(toggle.key, false);
    await command();
    assert.equal(store.workspace.get(toggle.key), true, toggle.key);
  }
  assert.match(informed[0]!, /^Line numbers: off \(user settings\)$/);
  assert.match(informed[1]!, /\(workspace settings\)$/);
  await root.dispose();
});

test("the toggles name real settings of their plugins", async () => {
  assert.deepEqual(
    toggles.map((toggle) => toggle.key),
    [
      "plugins.lineNumbers.enabled",
      "editor.readableLineLength",
      "plugins.diagrams.enabled",
      "plugins.inlineTitle.enabled",
      "plugins.vim.enabled",
    ],
  );
});

test("Set Note Font Size asks with the current size, accepts a number in range and takes a command argument", async () => {
  const store = layered({ "editor.fontSize": 16 });
  const first = await run(store, " 20 ");
  await first.fake.commands.get("markdownWorkbench.setNoteFontSize")!();
  assert.deepEqual(first.fake.prompts, ["16"]);
  assert.equal(store.user.get("editor.fontSize"), 20);
  store.workspace.set("editor.fontSize", 18);
  await first.fake.commands.get("markdownWorkbench.setNoteFontSize")!(22);
  assert.equal(store.workspace.get("editor.fontSize"), 22);
  assert.equal(store.user.get("editor.fontSize"), 20);
  assert.deepEqual(first.fake.prompts, ["16"], "an argument does not ask");
  await first.root.dispose();
  const dismissed = await run(store, undefined);
  await dismissed.fake.commands.get("markdownWorkbench.setNoteFontSize")!();
  assert.equal(store.workspace.get("editor.fontSize"), 22, "Escape keeps it");
  await dismissed.root.dispose();
});

test("the font size prompt only accepts numbers in the setting's range", () => {
  assert.equal(checkFontSize("16"), undefined);
  assert.equal(checkFontSize("8"), undefined);
  assert.equal(checkFontSize("48"), undefined);
  for (const bad of ["", "abc", "7", "49", "NaN", "1e9"]) {
    assert.ok(checkFontSize(bad), bad);
  }
  assert.equal(fontSizeArgument(18), 18);
  assert.equal(fontSizeArgument("18"), undefined);
  assert.equal(fontSizeArgument(100), undefined);
});

test("the font size range and default are the editor plugin's", () => {
  assert.equal(MIN_FONT_SIZE, font.MIN_FONT_SIZE);
  assert.equal(MAX_FONT_SIZE, font.MAX_FONT_SIZE);
  assert.equal(DEFAULT_FONT_SIZE, font.DEFAULT_FONT_SIZE);
});
