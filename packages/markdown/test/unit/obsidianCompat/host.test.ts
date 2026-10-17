import assert from "node:assert/strict";
import test from "node:test";
import {
  compatFixture,
  deferred,
  NOTE_A,
  NOTE_B,
  ROOT_A,
  ROOT_B,
} from "./fixture";
import { fakeDocument } from "../../support/vscode-fake";

test("B4: scoped snapshots, rejected edits and override caches keep two vaults independent", async (t) => {
  const f = await compatFixture();
  t.after(() => f.root.dispose());
  await f.change(
    `${ROOT_A}/.obsidian/types.json`,
    '{"types":{"status":"text","aliases":"aliases"}}',
  );
  await f.change(
    `${ROOT_B}/.obsidian/types.json`,
    '{"types":{"status":"number"}}',
  );
  await f.change(`${ROOT_A}/.obsidian/app.json`, '{"useMarkdownLinks":true}');
  await f.change(`${ROOT_B}/.obsidian/app.json`, '{"useMarkdownLinks":false}');
  assert.deepEqual(await f.service.getPropertyTypes({ documentUri: NOTE_A }), {
    status: "text",
    aliases: "aliases",
  });
  assert.deepEqual(await f.service.getPropertyTypes({ vaultRoot: ROOT_B }), {
    status: "number",
  });
  f.focus.uri = NOTE_B;
  await assert.rejects(
    f.service.setPropertyType({ documentUri: NOTE_A }, "status", "date"),
    /read-only.*atomic conditional writes/,
  );
  assert.equal(
    (await f.service.getPropertyTypes({ vaultRoot: ROOT_A })).status,
    "text",
  );
  assert.equal(
    (await f.service.getPropertyTypes({ documentUri: NOTE_B })).status,
    "number",
  );
  assert.equal(f.writes.length, 0);
  assert.deepEqual(
    await f.service.getObsidianOverrides({ vaultRoot: ROOT_A }),
    { "links.useWikilinks": false },
  );
  assert.deepEqual(
    await f.service.getObsidianOverrides({ vaultRoot: ROOT_B }),
    { "links.useWikilinks": true },
  );
  assert.equal(f.watchers.size, 4);
  await assert.rejects(
    f.service.getPropertyTypes({ vaultRoot: `${ROOT_A}/notes` }),
    /resolved vault root/,
  );
});

test("B4: an async edit attempt retains its originating vault while focus changes", async (t) => {
  const f = await compatFixture();
  t.after(() => f.root.dispose());
  const sourceA = '{"types":{"due":"date"}}';
  const sourceB = '{"types":{"done":"checkbox"}}';
  await f.change(`${ROOT_A}/.obsidian/types.json`, sourceA);
  await f.change(`${ROOT_B}/.obsidian/types.json`, sourceB);
  await f.service.getPropertyTypes({ documentUri: NOTE_A });
  await f.service.getPropertyTypes({ documentUri: NOTE_B });
  const entered = deferred();
  const release = deferred();
  f.hooks.beforeRead = async (uri) => {
    if (uri === `${ROOT_A}/.obsidian/types.json`) {
      entered.resolve();
      await release.promise;
    }
  };
  f.focus.uri = NOTE_A;
  const rejectedA = assert.rejects(
    f.service.setPropertyType({ documentUri: NOTE_A }, "due", "text"),
    /read-only/,
  );
  await entered.promise;
  f.focus.uri = NOTE_B;
  try {
    await assert.rejects(
      f.service.setPropertyType({ documentUri: NOTE_B }, "done", "text"),
      /read-only/,
    );
    assert.deepEqual(
      await f.service.getPropertyTypes({ documentUri: NOTE_B }),
      {
        done: "checkbox",
      },
    );
  } finally {
    release.resolve();
  }
  await rejectedA;
  assert.equal(f.data.get(`${ROOT_A}/.obsidian/types.json`), sourceA);
  assert.equal(f.data.get(`${ROOT_B}/.obsidian/types.json`), sourceB);
  assert.equal(f.writes.length, 0);
});

test("B1: base A checked, then external B arrives before mutation; A-derived edit cannot overwrite B", async (t) => {
  const f = await compatFixture();
  t.after(() => f.root.dispose());
  const uri = `${ROOT_A}/.obsidian/types.json`;
  const base = '{"types":{"status":"text"}}';
  const external =
    '{"types":{"status":"checkbox","Obsidian":"future"},"metadata":true}';
  await f.change(uri, base);
  await f.service.getPropertyTypes({ documentUri: NOTE_A });
  const entered = deferred();
  const release = deferred();
  f.hooks.beforeWrite = async () => {
    // An unconditional writer has already passed its last base comparison here.
    entered.resolve();
    await release.promise;
  };
  const outcome = f.service
    .setPropertyType({ documentUri: NOTE_A }, "status", "number")
    .then(
      () => undefined,
      (error: unknown) => error,
    );
  // A safe host rejects before reaching writeText; the old host pauses inside
  // writeText after comparing A. Either path lets the external writer finish.
  await Promise.race([entered.promise, outcome]);
  f.data.set(uri, external);
  release.resolve();
  const error = await outcome;
  assert.ok(error instanceof Error, "the A-derived edit must reject");
  assert.match(error.message, /read-only.*atomic conditional writes/);
  assert.equal(f.data.get(uri), external);
  assert.equal(f.writes.length, 0);
  await f.change(uri, external);
  assert.deepEqual(await f.service.getPropertyTypes({ documentUri: NOTE_A }), {
    status: "checkbox",
    Obsidian: "future",
  });
});

test("B1: read-only edits cannot create missing configuration or delete an existing preference", async (t) => {
  const f = await compatFixture();
  t.after(() => f.root.dispose());
  let directoryCreates = 0;
  f.hooks.beforeMkdir = async () => {
    directoryCreates += 1;
  };
  const uri = `${ROOT_A}/.obsidian/types.json`;
  await assert.rejects(
    f.service.setPropertyType({ documentUri: NOTE_A }, "status", "text"),
    /read-only/,
  );
  assert.equal(f.data.has(uri), false);
  const source = '{"types":{"status":"text","unknown":"future"}}';
  await f.change(uri, source);
  const snapshot = await f.service.getPropertyTypes({ documentUri: NOTE_A });
  const changes: string[] = [];
  f.service.onDidChangeVaultConfig((change) => changes.push(change.vaultRoot));
  await assert.rejects(
    f.service.setPropertyType({ vaultRoot: ROOT_A }, "status", null),
    /read-only/,
  );
  assert.equal(f.data.get(uri), source);
  assert.equal(
    await f.service.getPropertyTypes({ documentUri: NOTE_A }),
    snapshot,
  );
  assert.deepEqual(changes, []);
  assert.equal(directoryCreates, 0);
  assert.equal(f.writes.length, 0);
});

test("B1/B3: host reads propagate failures and re-check file containment", async (t) => {
  const f = await compatFixture();
  t.after(() => f.root.dispose());
  const uri = `${ROOT_A}/.obsidian/types.json`;
  f.failures.set(
    uri,
    Object.assign(new Error("No permissions"), { code: "NoPermissions" }),
  );
  await f.change(uri, '{"types":{"keep":"text"}}');
  await assert.rejects(
    f.service.setPropertyType({ documentUri: NOTE_A }, "x", "text"),
    /unreadable/,
  );
  assert.equal(f.writes.length, 0);
  assert.equal(f.data.get(uri), '{"types":{"keep":"text"}}');
  assert.ok(
    f.authorizations.some((item) => item.root === ROOT_A && item.uri === uri),
  );
  f.failures.delete(uri);
  f.symlinks.add(`${ROOT_A}/.obsidian`);
  await assert.rejects(
    f.service.setPropertyType({ vaultRoot: ROOT_A }, "x", "text"),
    /unreadable/,
  );
  assert.equal(f.writes.length, 0);
});

test("B2: effective editor settings inspect the originating document and obey explicit layers", async (t) => {
  const f = await compatFixture();
  t.after(() => f.root.dispose());
  await f.change(
    `${ROOT_A}/.obsidian/app.json`,
    '{"useMarkdownLinks":true,"newLinkFormat":"relative","attachmentFolderPath":"/","newFileLocation":"current","propertiesInDocument":"hidden","livePreview":false}',
  );
  await f.configuration.prepare(NOTE_A);
  const read = () =>
    f.workbench.settings.forNote(fakeDocument({ uri: NOTE_A }));
  assert.equal(read().features?.links?.config.useWikilinks, false);
  assert.equal(read().features?.links?.config.newLinkFormat, "relative");
  assert.equal(read().features?.links?.config.newNoteFolder, ".");
  assert.equal(read().features?.links?.config.attachmentFolder, "");
  assert.equal(read().features?.properties?.config.display, "hidden");
  assert.equal(read().mode, "source");
  for (const layer of [
    "globalValue",
    "globalLocalValue",
    "globalRemoteValue",
    "workspaceValue",
    "workspaceFolderValue",
    "globalLanguageValue",
    "workspaceLanguageValue",
    "workspaceFolderLanguageValue",
  ]) {
    f.inspections.set(`${NOTE_A}|links.useWikilinks`, { [layer]: true });
    assert.equal(read().features?.links?.config.useWikilinks, true, layer);
  }
  assert.ok(
    f.inspected.some(
      (item) => item.resource === NOTE_A && item.key === "links.useWikilinks",
    ),
  );
  assert.equal(f.writes.length, 0, "settings contributions never write files");
});

test("watchers notify with vault identity; app deletion clears settings, failed reads retain last good", async (t) => {
  const f = await compatFixture();
  t.after(() => f.root.dispose());
  const changes: string[] = [];
  const events: string[] = [];
  f.root.on("obsidianCompat/changed", (change) => {
    events.push(change.vaultRoot);
  });
  const stop = f.service.onDidChangeVaultConfig((change) => {
    changes.push(change.vaultRoot);
  });
  const uri = `${ROOT_A}/.obsidian/app.json`;
  await f.change(uri, '{"propertiesInDocument":"hidden"}');
  assert.deepEqual(
    await f.service.getObsidianOverrides({ vaultRoot: ROOT_A }),
    { "properties.display": "hidden" },
  );
  await f.change(uri, "{");
  await f.change(uri, "{");
  assert.deepEqual(
    await f.service.getObsidianOverrides({ vaultRoot: ROOT_A }),
    { "properties.display": "hidden" },
  );
  assert.equal(
    f.warnings.filter((message) => message.includes("app.json")).length,
    1,
  );
  await f.change(uri, undefined);
  assert.deepEqual(
    await f.service.getObsidianOverrides({ vaultRoot: ROOT_A }),
    {},
  );
  assert.deepEqual(changes, events);
  assert.ok(changes.every((root) => root === ROOT_A));
  stop();
  const count = changes.length;
  await f.change(uri, '{"propertiesInDocument":"source"}');
  assert.equal(changes.length, count);
});

test("B3: alternate profiles replace their vault's watchers and cannot reuse stale overrides", async (t) => {
  const f = await compatFixture();
  t.after(() => f.root.dispose());
  await f.change(`${ROOT_A}/.obsidian/app.json`, '{"livePreview":false}');
  await f.configuration.prepare(NOTE_A);
  f.values.set("obsidianCompat.configFolder", ".obsidian-awesome");
  f.data.set(`${ROOT_A}/.obsidian-awesome/app.json`, '{"livePreview":true}');
  await f.changeSettings();
  await f.configuration.prepare(NOTE_A);
  assert.equal(
    f.configuration.get("editor.defaultMode", "livePreview", NOTE_A),
    "livePreview",
  );
  assert.ok(!f.watchers.has(`${ROOT_A}/.obsidian/app.json`));
  assert.ok(f.watchers.has(`${ROOT_A}/.obsidian-awesome/app.json`));
  await f.change(
    `${ROOT_A}/.obsidian-awesome/types.json`,
    '{"types":{"newType":"number"}}',
  );
  assert.deepEqual(await f.service.getPropertyTypes({ documentUri: NOTE_A }), {
    newType: "number",
  });
  await assert.rejects(
    f.service.setPropertyType({ documentUri: NOTE_A }, "newType", "text"),
    /read-only/,
  );
  assert.equal(f.writes.length, 0);
});

test("disabling the feature removes overrides, joins work and disposes all watchers", async (t) => {
  const f = await compatFixture();
  t.after(() => f.root.dispose());
  await f.change(
    `${ROOT_A}/.obsidian/app.json`,
    '{"livePreview":false,"alwaysUpdateLinks":true}',
  );
  await f.configuration.prepare(NOTE_A);
  assert.equal(
    f.configuration.get("editor.defaultMode", "livePreview", NOTE_A),
    "source",
  );
  assert.equal(
    f.workbench.settings.get("linkUpdates.mode", "prompt", NOTE_A),
    "always",
  );
  f.values.set("plugins.obsidianCompat.enabled", false);
  assert.equal(
    f.configuration.get("editor.defaultMode", "livePreview", NOTE_A),
    "livePreview",
  );
  f.values.delete("plugins.obsidianCompat.enabled");
  f.values.set("preset", "minimal");
  assert.equal(
    f.configuration.get("editor.defaultMode", "livePreview", NOTE_A),
    "livePreview",
  );
  await f.fiber.dispose();
  await f.root.settled();
  assert.equal(f.watchers.size, 0);
  assert.equal(f.nativeListeners.size, 0);
  assert.equal(
    f.configuration.get("linkUpdates.mode", "prompt", NOTE_A),
    "prompt",
  );
  await assert.rejects(
    f.service.setPropertyType({ documentUri: NOTE_A }, "x", "text"),
    /stopped/,
  );
});

test("B3: a rejected profile leaves the Markdown settings path usable without writing", async (t) => {
  const f = await compatFixture();
  t.after(() => f.root.dispose());
  await f.change(`${ROOT_A}/.obsidian/app.json`, '{"livePreview":false}');
  await f.configuration.prepare(NOTE_A);
  f.values.set("obsidianCompat.configFolder", "../outside");
  await f.changeSettings();
  await f.configuration.prepare(NOTE_A);
  await f.configuration.prepare(NOTE_A);
  assert.equal(
    f.configuration.get("editor.defaultMode", "livePreview", NOTE_A),
    "livePreview",
  );
  await assert.rejects(
    f.service.setPropertyType({ documentUri: NOTE_A }, "x", "text"),
    /inside the vault/,
  );
  assert.equal(f.writes.length, 0);
  assert.equal(
    f.warnings.filter((message) => message.includes("Could not prepare"))
      .length,
    1,
  );
});

test("B1: read-only rejections leave the same-vault queue and watchers usable", async (t) => {
  const f = await compatFixture();
  t.after(() => f.root.dispose());
  const results = await Promise.allSettled([
    f.service.setPropertyType({ documentUri: NOTE_A }, "first", "text"),
    f.service.setPropertyType({ vaultRoot: ROOT_A }, "second", "number"),
  ]);
  for (const result of results) {
    assert.equal(result.status, "rejected");
    if (result.status === "rejected") {
      assert.match(result.reason.message, /read-only/);
    }
  }
  await f.change(
    `${ROOT_A}/.obsidian/types.json`,
    '{"types":{"external":"future"}}',
  );
  assert.deepEqual(await f.service.getPropertyTypes({ documentUri: NOTE_A }), {
    external: "future",
  });
  assert.equal(f.writes.length, 0);
});
