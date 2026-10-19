import assert from "node:assert/strict";
import test from "node:test";
import { hasExplicitSetting } from "../../../src/plugins/obsidianCompat/precedence";
import {
  mapAppSettings,
  OVERRIDE_KEYS,
} from "../../../src/plugins/obsidianCompat/app-settings";
import { resolveConfigDirectory } from "../../../src/plugins/obsidianCompat/config-dir";
import { findVaultRoot, foldersUpTo } from "../../../src/plugins/vault/roots";
import { exclusionMatcher } from "../../../src/plugins/vault/exclusion";

const layers = [
  "globalValue",
  "globalLocalValue",
  "globalRemoteValue",
  "workspaceValue",
  "workspaceFolderValue",
  "globalLanguageValue",
  "globalLocalLanguageValue",
  "globalRemoteLanguageValue",
  "globalLanguageLocalValue",
  "globalLanguageRemoteValue",
  "workspaceLanguageValue",
  "workspaceFolderLanguageValue",
];
for (const layer of layers) {
  test(`B2: ${layer} blocks an Obsidian override even when the value is false or null`, () => {
    for (const value of [false, null, "", 0, [], {}]) {
      assert.equal(
        hasExplicitSetting({ defaultValue: true, [layer]: value }),
        true,
      );
    }
  });
}
test("B2: only defaults and undefined explicit layers allow Obsidian candidates", () => {
  assert.equal(hasExplicitSetting(undefined), false);
  assert.equal(
    hasExplicitSetting(
      Object.fromEntries(layers.map((key) => [key, undefined])),
    ),
    false,
  );
  assert.equal(
    hasExplicitSetting({
      key: "x",
      defaultValue: false,
      defaultLanguageValue: true,
      languageIds: ["markdown"],
    }),
    false,
  );
});

test("ranked app.json policies map exactly the eight phase-one settings", () => {
  const mapped = mapAppSettings({
    useMarkdownLinks: true,
    newLinkFormat: "relative",
    attachmentFolderPath: "/",
    newFileLocation: "current",
    userIgnoreFilters: ["Archive/", "**/*.excalidraw.md"],
    propertiesInDocument: "hidden",
    livePreview: false,
    alwaysUpdateLinks: true,
    vimMode: true,
    enabledCssSnippets: ["unsafe"],
  });
  assert.deepEqual(Object.keys(mapped), OVERRIDE_KEYS);
  assert.deepEqual(mapped, {
    "links.useWikilinks": false,
    "links.newLinkFormat": "relative",
    "files.attachmentFolder": "",
    "files.newNoteFolder": ".",
    "vault.excludedFiles": ["Archive/", "**/*.excalidraw.md"],
    "properties.display": "hidden",
    "editor.defaultMode": "source",
    "linkUpdates.mode": "always",
  });
  const excludes = exclusionMatcher(mapped["vault.excludedFiles"] as string[]);
  assert.equal(excludes("Archive/Old.md"), true);
  assert.equal(excludes("notes/Drawing.excalidraw.md"), true);
  assert.equal(excludes("Archive.md"), false);
  assert.ok(Object.isFrozen(mapped));
  assert.ok(Object.isFrozen(mapped["vault.excludedFiles"]));
});

test("app.json handles new-note locations, attachments and both editing/link booleans", () => {
  for (const [app, expected] of [
    [{ newFileLocation: "root" }, ""],
    [{ newFileLocation: "current" }, "."],
    [{ newFileLocation: "folder", newFileFolderPath: "Notes" }, "Notes"],
    [{ newFileLocation: "folder" }, undefined],
    [{ newFileFolderPath: "Notes" }, undefined],
  ] as const) {
    assert.equal(mapAppSettings(app)["files.newNoteFolder"], expected);
  }
  assert.deepEqual(
    mapAppSettings({
      useMarkdownLinks: false,
      attachmentFolderPath: "./images",
      livePreview: true,
    }),
    {
      "links.useWikilinks": true,
      "files.attachmentFolder": "./images",
      "editor.defaultMode": "livePreview",
    },
  );
  assert.deepEqual(mapAppSettings({ alwaysUpdateLinks: false }), {});
  assert.deepEqual(mapAppSettings({}), {});
  assert.deepEqual(
    mapAppSettings({
      useMarkdownLinks: "true",
      newLinkFormat: "bogus",
      attachmentFolderPath: 0,
      livePreview: 0,
      propertiesInDocument: "wrong",
      userIgnoreFilters: ["Archive", 2],
      alwaysUpdateLinks: "true",
    }),
    {},
  );
  assert.throws(() => mapAppSettings([]), /object/);
});

test("B3: .git discovers the vault but .obsidian independently selects config", async () => {
  const root = "file:///workspace/vault";
  const entries = new Set([`${root}/.git`, `${root}/.obsidian`]);
  const markers = [".git", ".obsidian"];
  const found = await findVaultRoot(
    foldersUpTo(`${root}/notes/Note.md`, "file:///workspace"),
    async (folder) =>
      markers.some((marker) => entries.has(`${folder}/${marker}`)),
  );
  assert.equal(found, root);
  assert.equal(resolveConfigDirectory(found!), `${root}/.obsidian`);
  assert.equal(
    resolveConfigDirectory(found!, ".obsidian-awesome"),
    `${root}/.obsidian-awesome`,
  );
  assert.equal(
    resolveConfigDirectory("vscode-remote://host/vault", "profiles/My Profile"),
    "vscode-remote://host/vault/profiles/My%20Profile",
  );
});
for (const folder of [
  "../outside",
  ".obsidian/../../outside",
  "/outside",
  "\\outside",
  "C:\\outside",
  "file:///outside",
  "",
  ".",
]) {
  test(`B3: config folder ${JSON.stringify(folder)} cannot escape the vault`, () => {
    assert.throws(
      () => resolveConfigDirectory("file:///vault", folder),
      /inside the vault/,
    );
  });
}
