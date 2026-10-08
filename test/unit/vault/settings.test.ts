import test from "node:test";
import assert from "node:assert/strict";
import {
  exclusionMatcher,
  isIgnoredPath,
} from "../../../src/plugins/vault/exclusion";
import { findVaultRoot, foldersUpTo } from "../../../src/plugins/vault/roots";
import { Snapshot } from "../../../src/plugins/vault/snapshot";
import { MemoryStore } from "./memory-fs";

test("the vault root is the nearest folder with a marker, else the workspace folder", async () => {
  const folders = foldersUpTo(
    "file:///ws/vault/notes/deep/Note.md",
    "file:///ws/",
  );
  assert.deepEqual(folders, [
    "file:///ws/vault/notes/deep",
    "file:///ws/vault/notes",
    "file:///ws/vault",
    "file:///ws",
  ]);
  const markers = new Set(["file:///ws/vault", "file:///ws"]);
  assert.equal(
    await findVaultRoot(folders, async (folder) => markers.has(folder)),
    "file:///ws/vault",
  );
  assert.equal(await findVaultRoot(folders, async () => false), "file:///ws");
  assert.deepEqual(foldersUpTo("file:///ws/Note.md", "file:///ws"), [
    "file:///ws",
  ]);
});

test("excluded-file filters: prefixes as in Obsidian, globs when wildcards are present", () => {
  const cases: [string[], string, boolean][] = [
    [["Archive/"], "Archive/Old.md", true],
    [["Archive/"], "Archive.md", false],
    [["Daily"], "Daily.md", true],
    [["Daily"], "Daily/2026-10-08.md", true],
    [["Daily"], "Dailyish.md", false],
    [["/Templates/"], "Templates/Meeting.md", true],
    [["**/*.excalidraw.md"], "a/b/Drawing.excalidraw.md", true],
    [["**/*.excalidraw.md"], "Drawing.excalidraw.md", true],
    [["*.pdf"], "paper.pdf", true],
    [["*.pdf"], "papers/paper.pdf", false],
    [["{Inbox,Scratch}/**"], "Scratch/idea.md", true],
    [["note?.md"], "note1.md", true],
    [["note?.md"], "note10.md", false],
    [["a+b (1).md"], "a+b (1).md", true],
    [[" ", ""], "A.md", false],
  ];
  for (const [filters, path, expected] of cases) {
    assert.equal(
      exclusionMatcher(filters)(path),
      expected,
      `${filters} ${path}`,
    );
  }
});

test("hidden folders and node_modules are never indexed", () => {
  assert.equal(isIgnoredPath(".obsidian/app.json"), true);
  assert.equal(isIgnoredPath("notes/.trash/Old.md"), true);
  assert.equal(isIgnoredPath("node_modules/x/README.md"), true);
  assert.equal(isIgnoredPath("notes/Note.md"), false);
});

test("snapshots round-trip in shards, rewrite only what changed and drop orphans", async () => {
  const store = new MemoryStore();
  const snapshot = new Snapshot();
  snapshot.setFile("A.md", {
    uri: "file:///A.md",
    mtime: 1,
    size: 2,
    hash: "a1",
  });
  snapshot.setMetadata("a1", { links: [] } as never);
  snapshot.setMetadata("b2", { links: [] } as never);
  await snapshot.save(store);
  assert.deepEqual([...store.files.keys()].sort(), [
    "files",
    "metadata-33",
    "metadata-50",
  ]);
  const restored = new Snapshot();
  await restored.load(store);
  assert.deepEqual(Object.keys(restored.metadata), ["a1"], "orphan b2 dropped");
  assert.deepEqual(restored.files["A.md"], snapshot.files["A.md"]);

  const writes = store.writes;
  restored.setMetadata("c3", { links: [] } as never);
  await restored.save(store);
  assert.equal(store.writes, writes + 1, "only one shard is written");
  assert.equal(restored.isDirty, false);
});

test("snapshots from another version or unreadable files start empty", async () => {
  const store = new MemoryStore();
  store.files.set(
    "files",
    JSON.stringify({ version: 0, files: { "A.md": {} } }),
  );
  const old = new Snapshot();
  await old.load(store);
  assert.deepEqual(Object.keys(old.files), []);
  store.files.set("files", "not json");
  await old.load(store);
  assert.deepEqual(Object.keys(old.files), []);
});

test("snapshots keep Maps in metadata, such as footnote references", async () => {
  const { metadata } = await import("../../../src/markdown/metadata");
  const note = metadata("Text[^1]\n\n[^1]: Note");
  assert.equal(note.footnotes.references.size, 1);
  const store = new MemoryStore();
  const snapshot = new Snapshot();
  snapshot.setFile("A.md", {
    uri: "file:///A.md",
    mtime: 1,
    size: 1,
    hash: "0h",
  });
  snapshot.setMetadata("0h", note);
  await snapshot.save(store);
  const restored = new Snapshot();
  await restored.load(store);
  const references = restored.metadata["0h"]!.footnotes.references;
  assert.ok(references instanceof Map);
  assert.deepEqual(
    [...references.keys()],
    [...note.footnotes.references.keys()],
  );
});

test("packing positions round-trips real metadata exactly", async () => {
  const { metadata } = await import("../../../src/markdown/metadata");
  const { pack, unpack } = await import("../../../src/plugins/vault/snapshot");
  const note = metadata(
    '---\ntags: [a]\nup: "[[Home]]"\n---\n# Title\n\nText [[Link#Part|x]] #tag ^block\n\n- [ ] task[^1]\n\n[^1]: note',
  );
  const restored = unpack(JSON.parse(JSON.stringify(pack(note))));
  assert.deepEqual(restored, note);
  assert.ok(
    JSON.stringify(pack(note)).length < JSON.stringify(note).length * 0.7,
  );
});

test("unpacking never lets a stored key set a prototype", async () => {
  const { unpack } = await import("../../../src/plugins/vault/snapshot");
  const stored = JSON.parse(
    '{"frontmatter":{"__proto__":{"polluted":true}},"blocks":{"__proto__":{"id":"x"}}}',
  );
  const restored = unpack(stored) as Record<string, Record<string, unknown>>;
  assert.equal(Object.getPrototypeOf(restored.frontmatter), Object.prototype);
  assert.equal(Object.getPrototypeOf(restored.blocks), null);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.deepEqual(Object.keys(restored.frontmatter!), ["__proto__"]);
});
