import test from "node:test";
import assert from "node:assert/strict";
import {
  EXTENSION_FILTER,
  FONT_SIZE_KEY,
  toggles,
} from "../../../src/plugins/settings/commands";
import settings from "../../../src/plugins/settings/manifest";
import { contributionId } from "../../../src/shared/setting-schema";
import { contributedSetting, layered, run } from "./layered";

test("the manifest's commands are the ones the plugin registers", async () => {
  const { fake, root } = await run(layered());
  assert.deepEqual(
    [...fake.commands.keys()].sort(),
    settings.contributes.commands
      .map((command) => contributionId(command.id))
      .sort(),
  );
  await root.dispose();
});

test("Open Settings filters the Settings UI to this extension", async () => {
  const store = layered();
  const { command, root } = await run(store);
  await command("openSettings")();
  assert.deepEqual(store.opened, ["@ext:t04dj14n9.vscode-markdown-workbench"]);
  assert.equal(EXTENSION_FILTER, store.opened[0]);
  await root.dispose();
});

test("each toggle flips the setting the Settings UI shows, in the workspace when it sets it, else the user's", async () => {
  const store = layered();
  const { command, root, informed } = await run(store);
  for (const toggle of toggles) {
    const fallback = contributedSetting(toggle.key).schema.default === true;
    await command(toggle.command)();
    assert.equal(store.user.get(toggle.key), !fallback, toggle.key);
    assert.equal(store.workspace.has(toggle.key), false, toggle.key);
    // Set in the workspace (as the Settings UI would): the next run changes that.
    store.workspace.set(toggle.key, true);
    await command(toggle.command)();
    assert.equal(store.workspace.get(toggle.key), false, toggle.key);
    // An edit elsewhere is what the next run reads: nothing is cached.
    store.workspace.set(toggle.key, false);
    await command(toggle.command)();
    assert.equal(store.workspace.get(toggle.key), true, toggle.key);
  }
  assert.match(informed[0]!, /^Line numbers: off \(user settings\)$/);
  assert.match(informed[1]!, /\(workspace settings\)$/);
  await root.dispose();
});

test("every dedicated command names a boolean (or, for the font size, number) setting that package.json contributes, and the manifest lists its command", () => {
  const commands = new Set<string>(
    settings.contributes.commands.map((c) => c.id),
  );
  for (const toggle of toggles) {
    const setting = contributedSetting(toggle.key);
    assert.ok(setting, `${toggle.key} is contributed`);
    assert.equal(setting.schema.type, "boolean", toggle.key);
    assert.equal(typeof setting.schema.default, "boolean", toggle.key);
    assert.ok(commands.has(toggle.command), toggle.command);
  }
  const size = contributedSetting(FONT_SIZE_KEY);
  assert.equal(size.schema.type, "number");
  assert.ok(commands.has("setNoteFontSize"));
  assert.equal(new Set(toggles.map((t) => t.key)).size, toggles.length);
});

test("a toggle on a setting whose current value is not a boolean starts from the schema's default", async () => {
  const store = layered();
  // A hand-edited workspace file holds text for a boolean.
  store.workspace.set("plugins.lineNumbers.enabled", "yes");
  const { command, errors, root } = await run(store);
  await command("toggleLineNumbers")();
  assert.equal(store.workspace.get("plugins.lineNumbers.enabled"), false);
  assert.deepEqual(errors, []);
  await root.dispose();
});

test("Set Note Font Size asks with the current size, accepts a number in range and takes a command argument", async () => {
  const store = layered();
  const first = await run(store, { input: " 20 " });
  await first.command("setNoteFontSize")();
  assert.deepEqual(
    first.asked.map((a) => a.value),
    ["16"],
  );
  assert.equal(store.user.get("editor.fontSize"), 20);
  store.workspace.set("editor.fontSize", 18);
  await first.command("setNoteFontSize")(22);
  assert.equal(store.workspace.get("editor.fontSize"), 22);
  assert.equal(store.user.get("editor.fontSize"), 20);
  assert.equal(first.asked.length, 1, "an argument does not ask");
  const check = first.asked[0]!.validate;
  assert.equal(check("16"), undefined);
  assert.equal(check("8"), undefined);
  assert.equal(check("48"), undefined);
  for (const bad of ["", "abc", "7", "49", "NaN", "1e9"]) {
    assert.ok(check(bad), bad);
  }
  await first.root.dispose();
  const dismissed = await run(store, { input: undefined });
  await dismissed.command("setNoteFontSize")();
  assert.equal(store.workspace.get("editor.fontSize"), 22, "Escape keeps it");
  await dismissed.root.dispose();
});

test("a hand-edited font size in the workspace is not trusted: the prompt starts from the default", async () => {
  const store = layered();
  store.workspace.set("editor.fontSize", "huge");
  const { command, asked, root } = await run(store, { input: undefined });
  await command("setNoteFontSize")();
  assert.equal(asked[0]!.value, "16");
  await root.dispose();
});
