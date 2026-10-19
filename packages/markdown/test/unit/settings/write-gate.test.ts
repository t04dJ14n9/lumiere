import test from "node:test";
import assert from "node:assert/strict";
import {
  checkNumber,
  checkWrite,
  editKind,
  validateValue,
} from "../../../src/shared/setting-schema";
import type { ContributedSetting } from "../../../src/shared/host";
import { toggles } from "../../../src/plugins/settings/commands";
import { contributed, contributedSetting, layered, run } from "./layered";

const schemaOf = (key: string) => contributedSetting(key).schema;

test("the gate refuses keys that are not this extension's own contributed settings", () => {
  for (const key of [
    "files.autoSave",
    "editor.fontSizee",
    "lumiere.markdown.editor.fontSize",
    "../editor.fontSize",
    "__proto__",
    "constructor",
    "",
    42,
    null,
    undefined,
    {},
    ["editor.fontSize"],
  ]) {
    const checked = checkWrite(contributed, key, 16);
    assert.ok("problem" in checked, String(key));
  }
  assert.ok("setting" in checkWrite(contributed, "editor.fontSize", 16));
});

test("the gate checks each value against the setting's own schema", () => {
  const ok = (key: string, value: unknown) =>
    assert.equal(validateValue(schemaOf(key), value), undefined, `${key}`);
  const bad = (key: string, value: unknown) =>
    assert.ok(validateValue(schemaOf(key), value), `${key} ${String(value)}`);
  ok("plugins.vim.enabled", true);
  ok("editor.fontSize", 8);
  ok("editor.fontSize", 48);
  ok("editor.tabSize", 4);
  ok("editor.defaultMode", "source");
  ok("files.newNoteFolder", "");
  bad("plugins.vim.enabled", "true");
  bad("plugins.vim.enabled", 1);
  bad("plugins.vim.enabled", null);
  bad("editor.fontSize", "20");
  bad("editor.fontSize", 7);
  bad("editor.fontSize", 49);
  bad("editor.fontSize", NaN);
  bad("editor.fontSize", Infinity);
  bad("editor.fontSize", 1e9);
  bad("editor.fontSize", null);
  bad("editor.tabSize", 2.5);
  bad("editor.defaultMode", "other");
  bad("editor.defaultMode", 0);
  bad("files.newNoteFolder", 5);
  bad("files.newNoteFolder", {});
  // Lists and objects are never written by a command.
  bad("vault.excludedFiles", ["a"]);
  bad("plugins.external", { a: true });
});

test("a missing, empty or damaged schema allows nothing", () => {
  const broken: Record<string, unknown>[] = [
    {},
    { description: "no type, no default" },
    { type: "array" },
    { enum: [] },
    { enum: [{ a: 1 }] },
    { type: 5 },
  ];
  for (const schema of broken) {
    assert.equal(
      editKind(schema as ContributedSetting["schema"]),
      "external",
      JSON.stringify(schema),
    );
    assert.ok(validateValue(schema as never, "x"), JSON.stringify(schema));
  }
  assert.equal(editKind(undefined), "external");
  assert.equal(editKind(null as never), "external");
  assert.ok(validateValue(undefined, true));
  assert.ok("problem" in checkWrite([], "editor.fontSize", 16));
  // A bound that is not a number is no bound.
  assert.equal(
    checkNumber(5, {
      type: "number",
      minimum: "x" as never,
      maximum: {} as never,
    }),
    undefined,
  );
  assert.equal(editKind({ type: ["null", "string"] }), "string");
  assert.equal(editKind({ default: true }), "boolean");
});

test("commands never write a key or value outside the gate, whatever they are given", async () => {
  const store = layered();
  const { command, errors, picks, root } = await run(store);
  const before = () => [...store.user.entries(), ...store.workspace.entries()];
  const hostile: unknown[] = [
    "files.autoSave",
    "chat.disableAIFeatures",
    "editor.fontSize",
    "lumiere.markdown.nothing",
    "lumiere.markdown.__proto__",
    42,
    null,
    {},
    ["lumiere.markdown.editor.fontSize"],
  ];
  for (const argument of hostile) {
    await command("changeSetting")(argument);
  }
  assert.equal(errors.length, hostile.length, "each is reported");
  assert.equal(picks.length, 0, "a bad key never opens the list");
  assert.deepEqual(before(), []);
  errors.length = 0;
  for (const size of ["big", 1e9, -3, NaN, null, {}, [16], 7, 49]) {
    await command("setNoteFontSize")(size);
  }
  assert.equal(errors.length, 9);
  assert.deepEqual(before(), []);
  // Only a valid key and value get through.
  await command("setNoteFontSize")(24);
  await command("changeSetting")("lumiere.markdown.plugins.vim.enabled");
  assert.equal(store.user.get("editor.fontSize"), 24);
  await root.dispose();
});

test("with no contributed settings (a missing or damaged package.json) commands report and write nothing", async () => {
  const store = layered([], {});
  const { command, errors, picks, root } = await run(store);
  await command("changeSetting")();
  await command("changeSetting")("lumiere.markdown.editor.fontSize");
  await command("setNoteFontSize")(20);
  for (const toggle of toggles) {
    await command(toggle.command)();
  }
  assert.equal(errors.length, 2 + 1 + toggles.length);
  assert.equal(picks.length, 0);
  assert.equal(store.user.size + store.workspace.size, 0);
  await root.dispose();
});

test("a setting with a damaged schema is listed but never written by Change Setting", async () => {
  const damaged: ContributedSetting = {
    key: "lumiere.markdown.broken.thing",
    schema: { description: "no type" },
  };
  const store = layered([...contributed, damaged], {});
  const { command, errors, root } = await run(store);
  await command("changeSetting")("lumiere.markdown.broken.thing");
  // Not editable by a command: it opens the Settings UI on that key instead.
  assert.deepEqual(store.opened, ["@id:lumiere.markdown.broken.thing"]);
  assert.deepEqual(errors, []);
  assert.equal(store.user.has("broken.thing"), false);
  await root.dispose();
});
