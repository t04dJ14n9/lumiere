import type { Uri } from "vscode";
import { Context } from "../../../src/kernel";
import { fixture as selectionFixture } from "../agent-bridge/fixture";
import { rpcPair } from "../../support/rpc-pair";
import type { EditorPanel, Editors } from "../../../src/plugins/editor/api";
import { SelectionSnapshots } from "../../../src/plugins/editor/selection";
import { registerEditorActions } from "../../../src/plugins/editor/actions-host";
import { markersHost } from "../../../src/plugins/markers/host";
import { codeBlocksHost } from "../../../src/plugins/codeBlocks/host";
import { protocol as jumps } from "../../../src/plugins/editor/jump-protocol";
import { protocol } from "../../../src/plugins/editor/protocol";
import { createApi } from "../../../src/host/api/facade";
import type { ApiPlatform } from "../../../src/host/api/platform";
import type { HostDocument, Workbench } from "../../../src/shared/runtime";
import { metadata } from "../../../src/markdown/metadata";
import { MemoryVaultIndex } from "../../../src/plugins/vault/memory-index";
import type { Vault } from "../../../src/plugins/vault/api";
export function uri(value: string): Uri {
  const parsed = new URL(value);
  return {
    scheme: parsed.protocol.slice(0, -1),
    path: parsed.pathname,
    toString: () => value,
  } as Uri;
}
export async function fixture() {
  const f = selectionFixture();
  const root = Context.create();
  const second = rpcPair();
  let active = "panel";
  const panels: EditorPanel[] = [
    f.panel,
    {
      ...f.panel,
      id: "second",
      column: 2,
      rpc: second.host,
      active: () => active === "second",
    },
  ];
  panels[0] = { ...f.panel, column: 1, active: () => active === "panel" };
  const reveals: unknown[] = [];
  const reader = { session: "test", generation: 0 };
  for (const pair of [f.pair, second]) {
    pair.client.handle(jumps, "navigationState", () => ({ ...reader }));
    pair.client.handle(protocol, "reveal", (request) => {
      reveals.push({
        from: request.from,
        to: request.to,
        focus: request.focus,
        version: request.version,
      });
      return true;
    });
  }
  second.client.handle(protocol, "captureSelection", () => ({
    from: 4,
    to: 7,
    version: f.panel.session.version,
    text: "two",
  }));
  const listeners = new Set<() => void>();
  const commands = new Map<string, () => unknown>();
  const featureOverrides: Record<string, boolean> = {};
  const externalOverrides = new Map<string, Record<string, boolean>>();
  let documentChanged = (_document: HostDocument) => {};
  const workbench: Workbench = {
    ...f.workbench,
    isTrusted: () => true,
    onChange: (listener) => {
      documentChanged = listener;
      return () => {};
    },
    onConfiguration: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    command: (id, run) => {
      if (commands.has(id)) {
        throw new Error("duplicate command");
      }
      commands.set(id, run);
      return () => {
        commands.delete(id);
      };
    },
    config: () => ({
      preset: "obsidian",
      mode: "livePreview",
      features: Object.fromEntries(
        Object.entries(featureOverrides).map(([id, enabled]) => [
          id,
          { enabled, config: {} },
        ]),
      ),
    }),
  };
  const editors: Editors = {
    ...f.editors,
    all: () => panels,
    active: () => panels.find((panel) => panel.id === active),
  };
  const selections = new SelectionSnapshots(
    (id) => panels.find((panel) => panel.id === id),
    workbench,
  );
  root.provide("workbench", workbench);
  root.provide("editors", editors);
  root.provide("selections", selections);
  root.plugin({
    name: "editor",
    inject: { required: ["workbench"] },
    apply(ctx) {
      registerEditorActions(ctx, editors, selections);
    },
  });
  root.plugin(markersHost);
  root.plugin(codeBlocksHost);
  const index = new MemoryVaultIndex({
    root: "file:///vault",
    folderNote: "index",
    linkFormat: "shortest",
  });
  index.replaceFiles(
    ["Note.md", "Other.md"].map((path) => ({
      path,
      uri: `file:///vault/${path}`,
      mtime: 1,
      size: 20,
    })),
  );
  index.setMetadata("Note.md", metadata("# Note\n[^x]\n\n[^x]: body"));
  index.setMetadata("Other.md", metadata("[[Note]]"));
  const vault: Vault = {
    index,
    pathOf: (value) =>
      value.startsWith("file:///vault/")
        ? value.slice("file:///vault/".length)
        : undefined,
    settled: async () => {},
  };
  root.provide("vaults", {
    all: () => [vault],
    forDocument: async () => vault,
    forWorkspace: async () => vault,
    locate: async (value) => ({ vault, path: vault.pathOf(value)! }),
    text: async () => "",
    open: async () => {},
    registerLinkPolicy: () => () => {},
    invalidateLinkResolution() {},
  });
  const settings: unknown[] = [];
  const platform: ApiPlatform = {
    uri,
    assertContained: async () => {},
    joinPath(base, path) {
      const url = new URL(base.toString());
      url.pathname = `${url.pathname.replace(/\/$/, "")}/${path.split("/").map(encodeURIComponent).join("/")}`;
      return uri(url.toString());
    },
    installed: (id) => id === "sample.provider",
    external: (resource) => ({
      ...externalOverrides.get("global"),
      ...externalOverrides.get(resource?.toString() ?? "global"),
    }),
    open: async (_uri, options) => {
      if (options.viewColumn === 2) {
        active = "second";
      }
    },
    settings: async (resource) => {
      settings.push(resource);
    },
    write: async (id, enabled, scope, external) => {
      const values = external
        ? { ...externalOverrides.get(scope.resource?.toString() ?? "global") }
        : featureOverrides;
      if (enabled === undefined) {
        delete values[id];
      } else {
        values[id] = enabled;
      }
      if (external) {
        externalOverrides.set(scope.resource?.toString() ?? "global", values);
      }
      for (const listener of listeners) {
        listener();
      }
    },
  };
  await root.settled();
  const api = await createApi(root, platform);
  return {
    ...f,
    workbench,
    root,
    api,
    platform,
    panels,
    second,
    reveals,
    reader,
    setActive: (id: string) => {
      active = id;
    },
    index,
    commands,
    settings,
    emitDocument: (document: HostDocument = f.panel.document) =>
      documentChanged(document),
    async dispose() {
      await root.dispose();
      await f.pair.dispose();
      await second.dispose();
    },
  };
}
