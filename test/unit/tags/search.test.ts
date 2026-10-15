import test from "node:test";
import assert from "node:assert/strict";
import { metadata } from "../../../src/markdown/metadata";
import { MemoryVaultIndex } from "../../../src/plugins/vault/memory-index";
import { taggedNotes, filterTagNotes } from "../../../src/plugins/tags/search";
import { Context } from "../../../src/kernel";
import { tagsHost } from "../../../src/plugins/tags/host";
import { protocol } from "../../../src/plugins/tags/protocol";
import type {
  HostViews,
  Navigation,
  PanelShell,
} from "../../../src/shared/runtime";
import { fakeWorkbench } from "../../support/vscode-fake";
import { rpcPair } from "../../support/rpc-pair";

function index() {
  const vault = new MemoryVaultIndex({
    root: "file:///vault",
    folderNote: "",
    linkFormat: "shortest",
  });
  for (const [path, source, excluded] of [
    ["One.md", "#Project/notes", false],
    ["Two.md", "---\ntags: [PROJECT]\n---", false],
    ["Other.md", "#projectile", false],
    ["Hidden.md", "#project", true],
  ] as const) {
    vault.upsertFile({
      path,
      uri: `file:///vault/${path}`,
      mtime: 0,
      size: source.length,
      excluded,
    });
    vault.setMetadata(path, metadata(source));
  }
  return vault;
}

test("tag search uses hierarchical case-insensitive metadata and skips excluded files", () => {
  const items = taggedNotes(index(), "project");
  assert.deepEqual(
    items.map((item) => item.label),
    ["One.md", "Two.md"],
  );
  assert.deepEqual(
    filterTagNotes(items, "notes").map((item) => item.label),
    ["One.md"],
  );
  assert.deepEqual(
    taggedNotes(index(), "project/notes").map((item) => item.label),
    ["One.md"],
  );
});

test("tag RPC opens a matching indexed note and unregisters when disabled", async () => {
  const pair = rpcPair();
  const root = Context.create();
  const opened: unknown[][] = [];
  const views = {
    pick: async (options) => ({ item: options.items("")[0], query: "" }),
  } as HostViews;
  root.provide("rpc", pair.host);
  root.provide("vault", index());
  root.provide(
    "workshop",
    fakeWorkbench({
      views,
      navigation: {
        open: async (...args) => {
          opened.push(args);
        },
      } as Navigation,
    }),
  );
  const start = () => root.plugin(tagsHost, { panel: {} as PanelShell });
  let fiber = start();
  await root.settled();
  assert.equal(
    await pair.client.call(protocol, "search", { tag: "project" }),
    true,
  );
  assert.deepEqual(opened[0], [
    "file:///vault",
    "file:///vault/One.md",
    "",
    false,
  ]);
  await fiber.dispose();
  await assert.rejects(
    pair.client.call(protocol, "search", { tag: "project" }),
    { code: "PluginDisabled" },
  );
  fiber = start();
  await root.settled();
  assert.equal(fiber.state, "active");
  assert.equal(
    await pair.client.call(protocol, "search", { tag: "absent" }),
    false,
  );
  await root.dispose();
  await pair.dispose();
});
