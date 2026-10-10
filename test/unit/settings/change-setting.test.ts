import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Context } from "../../../src/kernel";
import { settingsHost } from "../../../src/plugins/settings/host";
import {
  checkNumber,
  editKind,
  placement,
  settingRows,
} from "../../../src/plugins/settings/change";
import type {
  ContributedSetting,
  PickItem,
  SettingsAccess,
  SettingTarget,
} from "../../../src/shared/runtime";
import { fakeViews, workbenchWith } from "../views/fakes";

/** The contributed settings exactly as the generated package.json lists them. */
const contributed = Object.entries(
  (
    JSON.parse(readFileSync("package.json", "utf8")) as {
      contributes: {
        configuration: {
          properties: Record<string, ContributedSetting["schema"]>;
        };
      };
    }
  ).contributes.configuration.properties,
).map(([key, schema]) => ({ key, schema }));
const byKey = (key: string) =>
  contributed.find((setting) => setting.key === `markdownWorkbench.${key}`)!;

test("every contributed setting is listed, and each type gets its editor", () => {
  const rows = settingRows(contributed, () => undefined, "");
  assert.equal(rows.length, contributed.length);
  const kinds = new Map(
    contributed.map((setting) => [setting.key, editKind(setting.schema)]),
  );
  assert.equal(kinds.get("markdownWorkbench.plugins.vim.enabled"), "boolean");
  assert.equal(kinds.get("markdownWorkbench.editor.defaultMode"), "enum");
  assert.equal(kinds.get("markdownWorkbench.preset"), "enum");
  assert.equal(kinds.get("markdownWorkbench.editor.fontSize"), "number");
  assert.equal(kinds.get("markdownWorkbench.editor.tabSize"), "integer");
  assert.equal(kinds.get("markdownWorkbench.links.folderNote"), "string");
  assert.equal(kinds.get("markdownWorkbench.vault.excludedFiles"), "external");
  assert.equal(kinds.get("markdownWorkbench.plugins.external"), "external");
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
  assert.deepEqual(placement("markdownWorkbench.plugins.lineNumbers.enabled"), {
    group: "Line numbers",
    name: "Enabled",
  });
  assert.deepEqual(placement("markdownWorkbench.autoPair.brackets"), {
    group: "Auto pair",
    name: "Brackets",
  });
  assert.equal(placement("markdownWorkbench.preset").group, "General");
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
  assert.equal(rows[0]!.value.key, "markdownWorkbench.editor.fontSize");
  assert.equal(rows[0]!.description, "20");
  assert.match(rows[0]!.detail!, /Font size of the note text/);
  const unset = settingRows(contributed, () => 16, "").find(
    (row) => row.value.key === "markdownWorkbench.editor.fontSize",
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

/** Layered settings with the Settings UI's target rule, as in settings-commands.test. */
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
    contributed: () => contributed,
    async openUi(query) {
      opened.push(query);
    },
  };
  return { access, user, workspace, opened };
}

async function run(
  store: ReturnType<typeof layered>,
  answers: {
    pick?: (items: readonly PickItem<unknown>[]) => unknown;
    input?: string | undefined;
  },
) {
  const fake = fakeViews();
  const asked: { value: string; validate(text: string): string | undefined }[] =
    [];
  const picks: PickItem<unknown>[][] = [];
  const views = {
    ...fake.views,
    pick: async (options: { items(query: string): PickItem<unknown>[] }) => {
      const items = options.items("");
      picks.push(items);
      const chosen = answers.pick?.(items);
      return chosen === undefined
        ? undefined
        : { item: items.find((item) => item.value === chosen), query: "" };
    },
    input: async (options: {
      value: string;
      validate(text: string): string | undefined;
    }) => {
      asked.push(options);
      return answers.input;
    },
  } as never;
  const workbench = workbenchWith(views);
  workbench.settings = store.access;
  const root = Context.create({});
  root.provide("workbench", workbench);
  root.plugin(settingsHost);
  await root.settled();
  const change = fake.commands.get("markdownWorkbench.changeSetting")!;
  return { change, root, asked, picks };
}

test("Change Setting edits each type through its own prompt, with the Settings UI's keys and target", async () => {
  const store = layered(
    Object.fromEntries(
      contributed.map((setting) => [
        setting.key.replace("markdownWorkbench.", ""),
        setting.schema.default,
      ]),
    ),
  );
  const key = (name: string) => byKey(name);
  // The list itself: all settings, picked by value.
  const pickKey = (name: string) => (items: readonly PickItem<unknown>[]) =>
    items.find(
      (item) =>
        (item.value as ContributedSetting).key === `markdownWorkbench.${name}`,
    )?.value;
  let session = await run(store, { pick: pickKey("plugins.vim.enabled") });
  await session.change();
  assert.equal(store.user.get("plugins.vim.enabled"), true, "boolean toggles");
  assert.equal(session.picks[0]!.length, contributed.length);
  await session.root.dispose();

  // Workspace first: a key the workspace sets is changed there.
  store.workspace.set("plugins.vim.enabled", true);
  session = await run(store, { pick: pickKey("plugins.vim.enabled") });
  await session.change();
  assert.equal(store.workspace.get("plugins.vim.enabled"), false);
  assert.equal(store.user.get("plugins.vim.enabled"), true);
  await session.root.dispose();

  // Enum: a pick list of the schema's values.
  session = await run(store, {
    pick: (items) => {
      const first = items.find(
        (item) =>
          (item.value as ContributedSetting).key ===
          "markdownWorkbench.editor.defaultMode",
      );
      return first ? first.value : "source";
    },
  });
  await session.change();
  // The second pick (values) returned "source" as a value, not a setting.
  assert.equal(store.user.get("editor.defaultMode"), "source");
  assert.deepEqual(
    session.picks[1]!.map((item) => item.label),
    ["livePreview", "source"],
  );
  assert.equal(session.picks[1]![0]!.description, "current");
  await session.root.dispose();

  // Number: an input box validated against min and max.
  session = await run(store, {
    pick: pickKey("editor.fontSize"),
    input: " 22 ",
  });
  await session.change();
  assert.equal(store.user.get("editor.fontSize"), 22);
  assert.equal(session.asked[0]!.value, "16");
  assert.ok(session.asked[0]!.validate("7"));
  assert.equal(session.asked[0]!.validate("20"), undefined);
  await session.root.dispose();
  session = await run(store, {
    pick: pickKey("editor.fontSize"),
    input: undefined,
  });
  await session.change();
  assert.equal(store.user.get("editor.fontSize"), 22, "Escape keeps it");
  await session.root.dispose();

  // String: any text, including empty.
  session = await run(store, {
    pick: pickKey("files.newNoteFolder"),
    input: "Inbox",
  });
  await session.change();
  assert.equal(store.user.get("files.newNoteFolder"), "Inbox");
  await session.root.dispose();

  // Arrays and objects open in the Settings UI on that key.
  session = await run(store, { pick: pickKey("vault.excludedFiles") });
  await session.change();
  assert.deepEqual(store.opened, ["@id:markdownWorkbench.vault.excludedFiles"]);
  assert.equal(store.user.has("vault.excludedFiles"), false);
  await session.root.dispose();

  // A key given as the argument skips the list.
  session = await run(store, { input: "30" });
  await session.change("markdownWorkbench.editor.fontSize");
  assert.equal(store.user.get("editor.fontSize"), 30);
  assert.equal(session.picks.length, 0);
  assert.ok(key("editor.fontSize"));
  await session.root.dispose();
});
