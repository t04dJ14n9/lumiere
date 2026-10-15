import test from "node:test";
import assert from "node:assert/strict";
import { Context } from "../../../src/kernel";
import { metadata } from "../../../src/markdown/metadata";
import type { Okf } from "../../../src/plugins/okfCore/api";
import { okfCoreHost } from "../../../src/plugins/okfCore/host";
import type { Vault, Vaults } from "../../../src/plugins/vault/api";
import { MemoryVaultIndex } from "../../../src/plugins/vault/memory-index";
import type { Workshop } from "../../../src/shared/runtime";

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
  const root = Context.create();
  root.provide("vaults", {
    all: () => [vault],
    registerLinkPolicy: () => () => {},
    invalidateLinkResolution() {
      invalidated += 1;
    },
  } as unknown as Vaults);
  root.provide("workshop", {
    views: { setting: () => [] },
  } as unknown as Workshop);
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
