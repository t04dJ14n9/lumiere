import test from "node:test";
import assert from "node:assert/strict";
import { placement, settingRows } from "../../../src/plugins/settings/change";
import type { ContributedSetting, PickItem } from "../../../src/shared/host";
import {
  checkNumberText as checkNumber,
  editKind,
} from "../../../src/shared/setting-schema";
import { contributed, contributedSetting, layered, run } from "./layered";

const byKey = contributedSetting;

test("every contributed setting is listed, and each type gets its editor", () => {
  const rows = settingRows(contributed, () => undefined, "");
  assert.equal(rows.length, contributed.length);
  const kinds = new Map(
    contributed.map((setting) => [setting.key, editKind(setting.schema)]),
  );
  assert.equal(kinds.get("markdownWorkshop.plugins.vim.enabled"), "boolean");
  assert.equal(kinds.get("markdownWorkshop.editor.defaultMode"), "enum");
  assert.equal(kinds.get("markdownWorkshop.preset"), "enum");
  assert.equal(kinds.get("markdownWorkshop.editor.fontSize"), "number");
  assert.equal(kinds.get("markdownWorkshop.editor.tabSize"), "integer");
  assert.equal(kinds.get("markdownWorkshop.links.folderNote"), "string");
  assert.equal(kinds.get("markdownWorkshop.vault.excludedFiles"), "external");
  assert.equal(kinds.get("markdownWorkshop.plugins.external"), "external");
  assert.deepEqual([...new Set(kinds.values())].sort(), [
    "boolean",
    "enum",
    "external",
    "integer",
    "number",
    "string",
  ]);
});

test("settings are grouped by plugin, the plugin's switch beside its other settings", () => {
  assert.deepEqual(placement("markdownWorkshop.plugins.lineNumbers.enabled"), {
    group: "Line numbers",
    name: "Enabled",
  });
  assert.deepEqual(placement("markdownWorkshop.autoPair.brackets"), {
    group: "Auto pair",
    name: "Brackets",
  });
  assert.equal(placement("markdownWorkshop.preset").group, "General");
  const rows = settingRows(contributed, () => undefined, "");
  const groups = rows.map((row) => row.group!);
  assert.deepEqual(
    groups,
    [...groups].sort((a, b) => a.localeCompare(b)),
  );
  const autoPair = rows.filter((row) => row.group === "Auto pair");
  assert.deepEqual(autoPair.map((row) => row.label).sort(), [
    "Brackets",
    "Enabled",
    "Markdown",
  ]);
});

test("rows show the current value and the description, and a query ranks matches", () => {
  const rows = settingRows(
    contributed,
    (key) => (key === "editor.fontSize" ? 20 : undefined),
    "font size",
  );
  assert.equal(rows[0]!.value.key, "markdownWorkshop.editor.fontSize");
  assert.equal(rows[0]!.description, "20");
  assert.match(rows[0]!.detail!, /Font size of the note text/);
  const unset = settingRows(contributed, () => 16, "").find(
    (row) => row.value.key === "markdownWorkshop.editor.fontSize",
  )!;
  assert.equal(unset.description, "16 (default)");
  assert.equal(settingRows(contributed, () => 1, "zzzzqqqq").length, 0);
});

test("numbers are checked against the schema's own range and integer type", () => {
  const size = byKey("editor.fontSize").schema;
  assert.equal(checkNumber("16", size), undefined);
  assert.equal(checkNumber("8", size), undefined);
  assert.equal(checkNumber("48", size), undefined);
  assert.match(checkNumber("7", size)!, /from 8 to 48/);
  assert.match(checkNumber("49", size)!, /from 8 to 48/);
  assert.match(checkNumber("abc", size)!, /number/);
  assert.match(checkNumber("", size)!, /number/);
  const tabs = byKey("editor.tabSize").schema;
  assert.equal(checkNumber("4", tabs), undefined);
  assert.match(checkNumber("2.5", tabs)!, /whole/);
  assert.match(checkNumber("0", tabs) ?? "", /at least|from/);
});

test("Change Setting edits each type through its own prompt, with the Settings UI's keys and target", async () => {
  const store = layered();
  const pickKey = (name: string) => (items: readonly PickItem<unknown>[]) =>
    items.find(
      (item) =>
        (item.value as ContributedSetting).key === `markdownWorkshop.${name}`,
    )?.value;
  const change = async (
    answers: Parameters<typeof run>[1],
    argument?: unknown,
  ) => {
    const session = await run(store, answers);
    await session.command("changeSetting")(argument);
    await session.root.dispose();
    return session;
  };

  // Boolean toggles, and the list holds every setting.
  let session = await change({ pick: pickKey("plugins.vim.enabled") });
  assert.equal(store.user.get("plugins.vim.enabled"), true);
  assert.equal(session.picks[0]!.length, contributed.length);

  // A key the workspace sets is changed there, the user's stays.
  store.workspace.set("plugins.vim.enabled", true);
  await change({ pick: pickKey("plugins.vim.enabled") });
  assert.equal(store.workspace.get("plugins.vim.enabled"), false);
  assert.equal(store.user.get("plugins.vim.enabled"), true);

  // Enum: a pick list of the schema's values (the second pick returns a value).
  session = await change({
    pick: (items) =>
      pickKey("editor.defaultMode")(items) ??
      items.find((item) => item.value === "source")?.value,
  });
  assert.equal(store.user.get("editor.defaultMode"), "source");
  assert.deepEqual(
    session.picks[1]!.map((item) => item.label),
    ["livePreview", "source"],
  );
  assert.equal(session.picks[1]![0]!.description, "current");

  // Number: an input box validated against min and max.
  session = await change({ pick: pickKey("editor.fontSize"), input: " 22 " });
  assert.equal(store.user.get("editor.fontSize"), 22);
  assert.equal(session.asked[0]!.value, "16");
  assert.ok(session.asked[0]!.validate("7"));
  assert.equal(session.asked[0]!.validate("20"), undefined);
  await change({ pick: pickKey("editor.fontSize"), input: undefined });
  assert.equal(store.user.get("editor.fontSize"), 22, "Escape keeps it");
  // Out of range typed anyway (validation skipped by a caller): refused.
  session = await change({ pick: pickKey("editor.fontSize"), input: "999" });
  assert.equal(store.user.get("editor.fontSize"), 22);
  assert.equal(session.errors.length, 1);

  // String: any text, including empty.
  await change({ pick: pickKey("files.newNoteFolder"), input: "Inbox" });
  assert.equal(store.user.get("files.newNoteFolder"), "Inbox");

  // Arrays and objects open in the Settings UI on that key.
  await change({ pick: pickKey("vault.excludedFiles") });
  assert.deepEqual(store.opened, ["@id:markdownWorkshop.vault.excludedFiles"]);
  assert.equal(store.user.has("vault.excludedFiles"), false);

  // A key given as the argument skips the list.
  session = await change({ input: "30" }, "markdownWorkshop.editor.fontSize");
  assert.equal(store.user.get("editor.fontSize"), 30);
  assert.equal(session.picks.length, 0);
});
