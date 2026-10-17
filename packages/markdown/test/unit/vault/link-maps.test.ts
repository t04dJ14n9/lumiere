import test from "node:test";
import assert from "node:assert/strict";
import { metadata } from "../../../src/markdown/metadata";
import { MemoryVaultIndex } from "../../../src/plugins/vault/memory-index";
import type { VaultChange } from "../../../src/plugins/vault/api";

function entry(path: string) {
  return { uri: `file:///vault/${path}`, path, mtime: 1, size: 1 };
}

function vault(notes: Record<string, string>, folderNote = "") {
  const index = new MemoryVaultIndex({
    root: "file:///vault",
    folderNote,
    linkFormat: "shortest",
  });
  index.replaceFiles(Object.keys(notes).map(entry));
  for (const [path, text] of Object.entries(notes)) {
    index.setMetadata(path, metadata(text));
  }
  return index;
}

const counts = (map: ReadonlyMap<string, number>) => Object.fromEntries(map);

test("link maps count links, embeds and property links, and skip external and in-note links", () => {
  const index = vault({
    "A.md": [
      "---",
      'related: "[[B]]"',
      "---",
      "[[B]] [[B#Part|alias]] ![[image.png]] [b](B.md) [web](https://example.com) [[#Local]] [[Missing]] [[Missing]]",
    ].join("\n"),
    "B.md": "",
    "image.png": "",
  });
  assert.deepEqual(counts(index.resolvedLinks("A.md")), {
    "B.md": 4,
    "image.png": 1,
  });
  assert.deepEqual(counts(index.unresolvedLinks("A.md")), { Missing: 2 });
});

test("markdown link destinations are decoded before resolving", () => {
  const index = vault({ "A.md": "[x](My%20Note.md)", "My Note.md": "" });
  assert.deepEqual(counts(index.resolvedLinks("A.md")), { "My Note.md": 1 });
});

test("backlinks invert resolved links and exclude the note itself", () => {
  const index = vault({
    "A.md": "[[C]] [[C]]",
    "B.md": "[[C]]",
    "C.md": "[[C#Top]] [[#Self]]",
  });
  assert.deepEqual(index.backlinks("C.md"), [
    { path: "A.md", count: 2 },
    { path: "B.md", count: 1 },
  ]);
});

test("creating a file resolves links that mention its name, and only those", () => {
  const index = vault({ "A.md": "[[New]]", "B.md": "[[Other]]" });
  const resolvedB = index.resolvedLinks("B.md");
  index.upsertFile(entry("folder/New.md"));
  assert.deepEqual(counts(index.resolvedLinks("A.md")), { "folder/New.md": 1 });
  assert.deepEqual(counts(index.unresolvedLinks("A.md")), {});
  assert.equal(index.resolvedLinks("B.md"), resolvedB, "B was not re-resolved");
});

test("a nearer file with the same name takes over an ambiguous link", () => {
  const index = vault({ "notes/A.md": "[[Shared]]", "archive/Shared.md": "" });
  assert.deepEqual(counts(index.resolvedLinks("notes/A.md")), {
    "archive/Shared.md": 1,
  });
  index.upsertFile(entry("notes/Shared.md"));
  assert.deepEqual(counts(index.resolvedLinks("notes/A.md")), {
    "notes/Shared.md": 1,
  });
  index.deleteFile("notes/Shared.md");
  assert.deepEqual(counts(index.resolvedLinks("notes/A.md")), {
    "archive/Shared.md": 1,
  });
});

test("deleting a target makes its links unresolved; deleting a source drops its links", () => {
  const index = vault({ "A.md": "[[B]]", "B.md": "[[A]]" });
  index.deleteFile("B.md");
  assert.deepEqual(counts(index.unresolvedLinks("A.md")), { B: 1 });
  assert.deepEqual(index.backlinks("A.md"), []);
});

test("renaming re-resolves incoming links by name and the renamed note's own relative links", () => {
  const index = vault({
    "A.md": "[[B]] [[Renamed]]",
    "sub/B.md": "[[./C]]",
    "sub/C.md": "",
    "other/C.md": "",
  });
  index.renameFile("sub/B.md", entry("other/Renamed.md"));
  assert.deepEqual(counts(index.resolvedLinks("A.md")), {
    "other/Renamed.md": 1,
  });
  assert.deepEqual(counts(index.unresolvedLinks("A.md")), { B: 1 });
  assert.deepEqual(counts(index.resolvedLinks("other/Renamed.md")), {
    "other/C.md": 1,
  });
  assert.equal(index.metadata("other/Renamed.md")?.links.length, 1);
  assert.equal(index.metadata("sub/B.md"), undefined);
});

test("a new folder note resolves links to its folder", () => {
  const index = vault(
    { "A.md": "[[Topics]]", "Topics/One.md": "" },
    "_index.md",
  );
  assert.deepEqual(counts(index.unresolvedLinks("A.md")), { Topics: 1 });
  index.upsertFile(entry("Topics/_index.md"));
  assert.deepEqual(counts(index.resolvedLinks("A.md")), {
    "Topics/_index.md": 1,
  });
});

test("changing the folder-note setting re-resolves every note", () => {
  const index = vault({ "A.md": "[[Topics]]", "Topics/_index.md": "" });
  assert.deepEqual(counts(index.unresolvedLinks("A.md")), { Topics: 1 });
  index.configure({ folderNote: "_index.md", linkFormat: "shortest" });
  assert.deepEqual(counts(index.resolvedLinks("A.md")), {
    "Topics/_index.md": 1,
  });
});

test("tags count every occurrence, from text and properties", () => {
  const index = vault({
    "A.md": "---\ntags: [project/a]\n---\n#project/a #idea",
    "B.md": "#idea",
  });
  assert.deepEqual(counts(index.tags()), { "project/a": 2, idea: 2 });
  index.setMetadata("B.md", metadata("no tags"));
  assert.deepEqual(counts(index.tags()), { "project/a": 2, idea: 1 });
});

test("change listeners receive each change, and resolve listeners fire on request", () => {
  const index = vault({ "A.md": "" });
  const changes: VaultChange[] = [];
  let resolved = 0;
  const stop = index.onDidChange((change) => changes.push(change));
  index.onDidResolve(() => resolved++);
  index.upsertFile(entry("B.md"));
  index.upsertFile(entry("B.md"));
  index.renameFile("B.md", entry("C.md"));
  index.deleteFile("C.md");
  index.notifyResolved();
  stop();
  index.upsertFile(entry("D.md"));
  assert.deepEqual(changes, [
    { type: "create", path: "B.md" },
    { type: "modify", path: "B.md" },
    { type: "rename", path: "C.md", oldPath: "B.md" },
    { type: "delete", path: "C.md" },
  ]);
  assert.equal(resolved, 1);
});
