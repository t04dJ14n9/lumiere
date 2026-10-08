import test from "node:test";
import assert from "node:assert/strict";
import { Context } from "../../../src/kernel";
import { metadata } from "../../../src/markdown/metadata";
import type {
  VaultChange,
  Vaults,
  VaultSystem,
} from "../../../src/plugins/vault/api";
import { vaultHost, vaultsHost } from "../../../src/plugins/vault/host";
import { MemoryFileSystem, wait } from "./memory-fs";

/** A VaultSystem over one in-memory workspace at memory:///vault. */
function system(fs: MemoryFileSystem, markers: string[] = []) {
  const changed = new Set<(uri: string, text: string) => void>();
  const closed = new Set<(uri: string) => void>();
  const value: VaultSystem = {
    list: (root, limit, shallow) =>
      fs.list(root, limit).then(({ files, partial }) => ({
        partial,
        files: files
          .map((file) => ({ ...file, path: within(root, file.uri) }))
          .filter(
            (file): file is typeof file & { path: string } =>
              file.path !== undefined && (!shallow || !file.path.includes("/")),
          ),
      })),
    read: (uri) => fs.read(uri),
    watch: (root, listener) => fs.watch(root, listener),
    workspaceFolder: (uri) =>
      uri.startsWith("memory:///vault/") ? "memory:///vault" : undefined,
    exists: async (uri) => markers.includes(uri),
    store: () => undefined,
    settings: () => ({
      folderNote: "",
      linkFormat: "shortest",
      excludedFiles: [],
      rootMarkers: [".obsidian"],
    }),
    onSettingsChanged: () => () => {},
    onDocumentChanged: (listener) => {
      changed.add(listener);
      return () => {
        changed.delete(listener);
      };
    },
    onDocumentClosed: (listener) => {
      closed.add(listener);
      return () => {
        closed.delete(listener);
      };
    },
    createParser: () => ({
      parse: async (text) => metadata(text),
      dispose() {},
    }),
    hash: (text) => text,
    warn() {},
  };
  return {
    value,
    type: (uri: string, text: string) =>
      changed.forEach((listener) => listener(uri, text)),
    close: (uri: string) => closed.forEach((listener) => listener(uri)),
  };
}

function within(root: string, uri: string): string | undefined {
  const prefix = root + "/";
  return uri.startsWith(prefix)
    ? decodeURIComponent(uri.slice(prefix.length))
    : undefined;
}

const counts = (map: ReadonlyMap<string, number>) => Object.fromEntries(map);

async function start(fs: MemoryFileSystem, markers: string[] = []) {
  const host = system(fs, markers);
  const root = Context.create();
  root.provide("vaultSystem", host.value);
  root.plugin(vaultsHost);
  await root.settled();
  return {
    root,
    host,
    vaults: root.runtime.value("vaults") as Vaults,
  };
}

test("notes in one vault share one index; a marker folder starts its own vault", async () => {
  const fs = new MemoryFileSystem({
    "A.md": "[[B]]",
    "B.md": "",
    "sub/C.md": "[[D]]",
    "sub/D.md": "",
  });
  const { root, vaults } = await start(fs, ["memory:///vault/sub/.obsidian"]);
  const a = await vaults.forDocument("memory:///vault/A.md");
  const b = await vaults.forDocument("memory:///vault/B.md");
  const c = await vaults.forDocument("memory:///vault/sub/C.md");
  assert.equal(a, b);
  assert.equal(a.index.root, "memory:///vault");
  assert.equal(c.index.root, "memory:///vault/sub");
  await c.settled();
  assert.deepEqual(counts(c.index.resolvedLinks("C.md")), { "D.md": 1 });
  assert.equal(vaults.all().length, 2);
  await root.dispose();
});

test("typing in an open note updates its vault's index; closing restores the file", async () => {
  const fs = new MemoryFileSystem({ "A.md": "[[B]]", "B.md": "", "C.md": "" });
  const { root, host, vaults } = await start(fs);
  const vault = await vaults.forDocument("memory:///vault/A.md");
  await vault.settled();
  host.type("memory:///vault/A.md", "[[C]]");
  await wait(400);
  await vault.settled();
  assert.deepEqual(counts(vault.index.resolvedLinks("A.md")), { "C.md": 1 });
  host.close("memory:///vault/A.md");
  await vault.settled();
  assert.deepEqual(counts(vault.index.resolvedLinks("A.md")), { "B.md": 1 });
  await root.dispose();
});

test("index changes become vault/changed and vault/resolved events with the vault root", async () => {
  const fs = new MemoryFileSystem({ "A.md": "" });
  const { root, vaults } = await start(fs);
  const changes: [string, VaultChange][] = [];
  const resolved: string[] = [];
  root.on("vault/changed", (vaultRoot, change) =>
    changes.push([vaultRoot, change]),
  );
  root.on("vault/resolved", (vaultRoot) => resolved.push(vaultRoot));
  const vault = await vaults.forDocument("memory:///vault/A.md");
  await vault.settled();
  fs.create("B.md", "");
  await vault.settled();
  assert.deepEqual(changes.at(-1), [
    "memory:///vault",
    { type: "modify", path: "B.md" },
  ]);
  assert.ok(
    changes.some(
      ([, change]) => change.type === "create" && change.path === "B.md",
    ),
  );
  assert.ok(resolved.includes("memory:///vault"));
  await root.dispose();
});

test("a note outside the workspace is a vault of its own folder", async () => {
  const fs = new MemoryFileSystem();
  const { root, vaults } = await start(fs);
  const outside = await vaults.forDocument("file:///Downloads/Note.md");
  assert.equal(outside.index.root, "file:///Downloads");
  assert.equal(
    outside.pathOf("file:///Downloads/My%20Image.png"),
    "My Image.png",
  );
  assert.equal(vaults.all().length, 0, "not indexed or watched");
  await root.dispose();
});

test("each panel's vault service is the shared index of its note's vault", async () => {
  const fs = new MemoryFileSystem({ "A.md": "" });
  const { root, vaults } = await start(fs);
  const panel = root.plugin(vaultHost, { documentUri: "memory:///vault/A.md" });
  await root.settled();
  assert.equal(panel.state, "active");
  assert.equal(
    panel.context!.runtime.value("vault"),
    (await vaults.forDocument("memory:///vault/A.md")).index,
  );
  await root.dispose();
});
