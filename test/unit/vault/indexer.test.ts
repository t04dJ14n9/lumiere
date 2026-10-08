import test from "node:test";
import assert from "node:assert/strict";
import { VaultIndexer } from "../../../src/plugins/vault/indexer";
import { readSnapshot } from "../../../src/plugins/vault/snapshot";
import {
  MemoryFileSystem,
  MemoryStore,
  indexerOptions,
  wait,
} from "./memory-fs";

const counts = (map: ReadonlyMap<string, number>) => Object.fromEntries(map);

test("cold start lists, parses each note once, resolves links and saves a snapshot", async () => {
  const fs = new MemoryFileSystem({
    "A.md": "[[B]] ![[pic.png]]",
    "B.md": "#tag",
    "pic.png": "",
  });
  const store = new MemoryStore();
  let resolved = 0;
  const options = indexerOptions(fs, { store, onResolved: () => resolved++ });
  const indexer = new VaultIndexer(options);
  await indexer.settled();
  assert.equal(options.parses(), 2);
  assert.deepEqual(counts(indexer.index.resolvedLinks("A.md")), {
    "B.md": 1,
    "pic.png": 1,
  });
  assert.deepEqual(counts(indexer.index.tags()), { tag: 1 });
  assert.ok(resolved >= 1);
  await wait();
  const snapshot = readSnapshot(store.text);
  assert.deepEqual(Object.keys(snapshot.files).sort(), [
    "A.md",
    "B.md",
    "pic.png",
  ]);
  assert.equal(Object.keys(snapshot.metadata).length, 2);
  await indexer.dispose();
});

test("warm start serves the snapshot before listing and re-reads only changed notes", async () => {
  const fs = new MemoryFileSystem({
    "A.md": "[[B]]",
    "B.md": "",
    "C.md": "[[A]]",
  });
  const store = new MemoryStore();
  const first = new VaultIndexer(indexerOptions(fs, { store }));
  await first.settled();
  await first.dispose();

  fs.put("C.md", "[[B]] changed");
  let release!: () => void;
  fs.gate = new Promise((resolve) => (release = resolve));
  fs.reads = 0;
  const options = indexerOptions(fs, { store });
  const second = new VaultIndexer(options);
  await second.ready;
  assert.deepEqual(
    counts(second.index.resolvedLinks("A.md")),
    { "B.md": 1 },
    "usable before listing",
  );
  release();
  await second.settled();
  assert.equal(fs.reads, 1, "only C.md is read again");
  assert.equal(options.parses(), 1);
  assert.deepEqual(counts(second.index.resolvedLinks("C.md")), { "B.md": 1 });
  await second.dispose();
});

test("file events keep the index current; a rename keeps metadata without reading", async () => {
  const fs = new MemoryFileSystem({
    "A.md": "[[New]] [[Moved]]",
    "B.md": "[[A]]",
  });
  const indexer = new VaultIndexer(indexerOptions(fs));
  await indexer.settled();
  fs.create("New.md", "[[A]]");
  await indexer.settled();
  assert.deepEqual(counts(indexer.index.resolvedLinks("A.md")), {
    "New.md": 1,
  });
  assert.deepEqual(
    indexer.index.backlinks("A.md").map((link) => link.path),
    ["B.md", "New.md"],
  );

  const reads = fs.reads;
  fs.rename("B.md", "Moved.md");
  await indexer.settled();
  assert.equal(fs.reads, reads, "renamed note is not read again");
  assert.deepEqual(counts(indexer.index.resolvedLinks("Moved.md")), {
    "A.md": 1,
  });
  assert.deepEqual(counts(indexer.index.resolvedLinks("A.md")), {
    "New.md": 1,
    "Moved.md": 1,
  });

  fs.change("New.md", "no links");
  await indexer.settled();
  assert.deepEqual(
    indexer.index.backlinks("A.md").map((link) => link.path),
    ["Moved.md"],
  );

  fs.delete("New.md");
  await indexer.settled();
  assert.deepEqual(counts(indexer.index.unresolvedLinks("A.md")), { New: 1 });
  await indexer.dispose();
});

test("an open note is indexed from its unsaved text until it closes", async () => {
  const fs = new MemoryFileSystem({ "A.md": "[[B]]", "B.md": "", "C.md": "" });
  const indexer = new VaultIndexer(indexerOptions(fs));
  await indexer.settled();
  indexer.setOverlay("A.md", "[[C]]");
  indexer.setOverlay("A.md", "[[C]] [[C]]");
  await wait();
  await indexer.settled();
  assert.deepEqual(counts(indexer.index.resolvedLinks("A.md")), { "C.md": 2 });
  indexer.clearOverlay("A.md");
  await indexer.settled();
  assert.deepEqual(counts(indexer.index.resolvedLinks("A.md")), { "B.md": 1 });
  await indexer.dispose();
});

test("excluded files stay resolvable and are flagged; hidden folders are not indexed", async () => {
  const fs = new MemoryFileSystem({
    "A.md": "[[Old]]",
    "Archive/Old.md": "",
    ".obsidian/workspace.md": "",
    "node_modules/pkg/readme.md": "",
  });
  const options = indexerOptions(fs, {
    settings: { excludedFiles: ["Archive/"] },
  });
  const indexer = new VaultIndexer(options);
  await indexer.settled();
  assert.deepEqual(
    indexer.index.files().map((file) => file.path),
    ["A.md", "Archive/Old.md"],
  );
  assert.equal(indexer.index.file("Archive/Old.md")?.excluded, true);
  assert.deepEqual(counts(indexer.index.resolvedLinks("A.md")), {
    "Archive/Old.md": 1,
  });
  fs.create(".obsidian/new.md", "");
  await indexer.settled();
  assert.equal(indexer.index.file(".obsidian/new.md"), undefined);
  await indexer.dispose();
});

test("a listing over the limit reports a partial index", async () => {
  const fs = new MemoryFileSystem({ "A.md": "", "B.md": "" });
  fs.limit = 1;
  let partial = false;
  const indexer = new VaultIndexer(
    indexerOptions(fs, { onPartial: () => (partial = true) }),
  );
  await indexer.settled();
  assert.equal(partial, true);
  assert.equal(indexer.index.files().length, 1);
  await indexer.dispose();
});

test("an unreadable note is reported and does not stop indexing", async () => {
  const fs = new MemoryFileSystem({ "A.md": "[[B]]", "B.md": "" });
  const errors: string[] = [];
  const options = indexerOptions(fs, {
    parse: async (text) => {
      if (text.includes("[[B]]")) {
        throw new Error("parser crashed");
      }
      return (await import("../../../src/markdown/metadata")).metadata(text);
    },
    onError: (message) => errors.push(message),
  });
  const indexer = new VaultIndexer(options);
  await indexer.settled();
  assert.deepEqual(errors, ["Could not index A.md"]);
  assert.ok(indexer.index.metadata("B.md"));
  await indexer.dispose();
});

test("deleting a folder removes every file in it", async () => {
  const fs = new MemoryFileSystem({
    "A.md": "[[One]] [[Two]]",
    "Topic/One.md": "",
    "Topic/Sub/Two.md": "",
    "Topical.md": "",
  });
  const indexer = new VaultIndexer(indexerOptions(fs));
  await indexer.settled();
  fs.emit({ type: "delete", path: "Topic" });
  await indexer.settled();
  assert.deepEqual(
    indexer.index.files().map((file) => file.path),
    ["A.md", "Topical.md"],
  );
  assert.deepEqual(counts(indexer.index.unresolvedLinks("A.md")), {
    One: 1,
    Two: 1,
  });
  await indexer.dispose();
});
