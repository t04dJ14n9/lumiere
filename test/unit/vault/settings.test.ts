import test from "node:test";
import assert from "node:assert/strict";
import {
  exclusionMatcher,
  isIgnoredPath,
} from "../../../src/plugins/vault/exclusion";
import { findVaultRoot, foldersUpTo } from "../../../src/plugins/vault/roots";
import {
  emptySnapshot,
  readSnapshot,
  writeSnapshot,
} from "../../../src/plugins/vault/snapshot";

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

test("snapshots round-trip, drop orphaned metadata and ignore other versions", () => {
  const snapshot = emptySnapshot();
  snapshot.files["A.md"] = {
    uri: "file:///A.md",
    mtime: 1,
    size: 2,
    hash: "h1",
  };
  snapshot.metadata.h1 = { links: [] } as never;
  snapshot.metadata.orphan = { links: [] } as never;
  const restored = readSnapshot(writeSnapshot(snapshot));
  assert.deepEqual(Object.keys(restored.metadata), ["h1"]);
  assert.deepEqual(restored.files["A.md"], snapshot.files["A.md"]);
  assert.deepEqual(
    readSnapshot(JSON.stringify({ version: 0, files: {}, metadata: {} })),
    emptySnapshot(),
  );
  assert.deepEqual(readSnapshot("not json"), emptySnapshot());
});

test("snapshots keep Maps in metadata, such as footnote references", async () => {
  const { metadata } = await import("../../../src/markdown/metadata");
  const note = metadata("Text[^1]\n\n[^1]: Note");
  assert.equal(note.footnotes.references.size, 1);
  const snapshot = emptySnapshot();
  snapshot.files["A.md"] = {
    uri: "file:///A.md",
    mtime: 1,
    size: 1,
    hash: "h",
  };
  snapshot.metadata.h = note;
  const restored = readSnapshot(writeSnapshot(snapshot)).metadata.h!;
  assert.ok(restored.footnotes.references instanceof Map);
  assert.deepEqual(
    [...restored.footnotes.references.keys()],
    [...note.footnotes.references.keys()],
  );
});
