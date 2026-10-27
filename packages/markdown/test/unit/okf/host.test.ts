import { provideHostServices } from "../../../src/shared/host";
import { fakeHost } from "../../support/vscode-fake";
import test from "node:test";
import assert from "node:assert/strict";
import { createRoot } from "@workshop/core";
import { metadata } from "../../../src/markdown/metadata";
import type { Okf } from "../../../src/plugins/okfCore/api";
import { BUNDLE_SYNC_MS, okfCoreHost } from "../../../src/plugins/okfCore/host";
import type { Vault, Vaults } from "../../../src/plugins/vault/api";
import { MemoryVaultIndex } from "../../../src/plugins/vault/memory-index";

test("a vault-root bundle is registered and then removed", async () => {
  const index = new MemoryVaultIndex({
    root: "file:///vault",
    folderNote: "",
    linkFormat: "shortest",
  });
  index.replaceFiles(
    ["index.md", "concept.md"].map((path) => ({
      uri: `file:///vault/${path}`,
      path,
      mtime: 1,
      size: 1,
    })),
  );
  index.setMetadata("concept.md", metadata("---\ntype: Concept\n---\n"));
  let invalidated = 0;
  const vault = {
    index,
    settled: async () => {},
    pathOf: () => undefined,
  } as Vault;
  const root = createRoot();
  root.provide("vaults", {
    all: () => [vault],
    registerLinkPolicy: () => () => {},
    invalidateLinkResolution() {
      invalidated += 1;
    },
  } as unknown as Vaults);
  provideHostServices(root, fakeHost({ settings: { get: <T>() => [] as T } }));
  root.plugin(okfCoreHost, {});
  await root.settled();
  let service!: Okf;
  root.plugin({
    name: "reader",
    inject: { required: ["okf"] },
    apply(ctx) {
      service = ctx.okf;
    },
  });
  await root.settled();
  assert.deepEqual(
    service.bundles(vault).map((bundle) => bundle.root),
    [""],
  );
  index.setMetadata("concept.md", metadata("No type here."));
  root.emit("vault/resolved", index.root);
  assert.deepEqual(service.bundles(vault), []);
  assert.equal(invalidated, 1);
  await root.dispose();
});

test("a burst of note changes reads the vault's files once, after it settles", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const index = new MemoryVaultIndex({
    root: "file:///vault",
    folderNote: "",
    linkFormat: "shortest",
  });
  index.replaceFiles([
    { uri: "file:///vault/a.md", path: "a.md", mtime: 1, size: 1 },
  ]);
  let reads = 0;
  const files = index.files.bind(index);
  index.files = () => {
    reads += 1;
    return files();
  };
  const vault = {
    index,
    settled: async () => {},
    pathOf: () => undefined,
  } as Vault;
  const root = createRoot();
  root.provide("vaults", {
    all: () => [vault],
    registerLinkPolicy: () => () => {},
    invalidateLinkResolution() {},
  } as unknown as Vaults);
  provideHostServices(root, fakeHost({ settings: { get: <T>() => [] as T } }));
  root.plugin(okfCoreHost, {});
  await root.settled();
  reads = 0;

  // Indexing changes the vault once per note.
  for (let note = 0; note < 500; note++) {
    root.emit("vault/changed", index.root, { type: "modify", path: "a.md" });
  }
  assert.equal(reads, 0);
  t.mock.timers.tick(BUNDLE_SYNC_MS);
  assert.equal(reads, 1);
  await root.dispose();
});
