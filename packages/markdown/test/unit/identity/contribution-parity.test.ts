import {
  HOST_SERVICE_NAMES,
  provideHostServices,
} from "../../../src/shared/host";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import {
  createRoot,
  type BaseContext,
  type Plugin,
  type PluginHandle,
  type RootContext,
} from "@workshop/core";
import type { Okf } from "../../../src/plugins/okfCore/api";
import type { Editors } from "../../../src/plugins/editor/api";
import type { Vaults } from "../../../src/plugins/vault/api";
import { commandsHost } from "../../../src/plugins/commands/host";
import { assetsHost } from "../../../src/plugins/assets/host";
import { bridgeHost } from "../../../src/plugins/bridge/host";
import { cursorBridgeHost } from "../../../src/plugins/cursorBridge/host";
import { ideContextHost } from "../../../src/plugins/ideContext/host";
import { registerMarkdownAssociation } from "../../../src/plugins/editor/associations";
import { registerToggleTextEditor } from "../../../src/plugins/editor/toggle-text-editor";
import { registerGoToLine } from "../../../src/plugins/editor/go-to-line";
import { registerEditorActions } from "../../../src/plugins/editor/actions-host";
import { editorHost } from "../../../src/plugins/editor/host";
import { registerJumpHistory } from "../../../src/plugins/editor/jump-host";
import type { EditorPanel, Selections } from "../../../src/plugins/editor/api";
import { gitDiffEditorHost } from "../../../src/plugins/gitDiffEditor/host";
import { graphHost } from "../../../src/plugins/graph/host";
import { linkUpdatesHost } from "../../../src/plugins/linkUpdates/host";
import { obsidianMarketplaceHost } from "../../../src/plugins/obsidianMarketplace/host";
import { livePreviewHost } from "../../../src/plugins/livePreview/host";
import { marpHost } from "../../../src/plugins/marp/host";
import { registerOutlineActions } from "../../../src/plugins/outline/actions";
import { registerSymbolPicker } from "../../../src/plugins/outline/symbol-picker";
import { OPEN_COMMAND as outlineOpenCommand } from "../../../src/plugins/outline/commands";
import { outlineHost } from "../../../src/plugins/outline/host";
import { OPEN_COMMAND as backlinksOpenCommand } from "../../../src/plugins/backlinks/tree";
import { backlinksHost } from "../../../src/plugins/backlinks/host";
import {
  CREATE_COMMAND as outgoingCreateCommand,
  OPEN_COMMAND as outgoingOpenCommand,
} from "../../../src/plugins/outgoingLinks/tree";
import { outgoingLinksHost } from "../../../src/plugins/outgoingLinks/host";
import { SEARCH_COMMAND } from "../../../src/plugins/tags/tree";
import { tagsViewHost } from "../../../src/plugins/tags/view";
import { quickSwitcherHost } from "../../../src/plugins/quickSwitcher/host";
import { scratchHost } from "../../../src/plugins/scratch/host";
import { settingsHost } from "../../../src/plugins/settings/host";
import { wikiHost } from "../../../src/plugins/wiki/host";
import { registerPluginManagement } from "../../../src/host/api/management";
import { registerOpenReference } from "../../../src/host/api/open-reference";
import { MARKDOWN_EDITOR } from "../../../src/shared/editor-provider";
import type { Manifest } from "../../../src/shared/manifest";
import type { HostServices } from "../../../src/shared/host";
import type { WorkspaceFiles } from "../../../src/shared/workspace-files";
import {
  contributionId,
  SETTING_PREFIX,
} from "../../../src/shared/setting-schema";
import { fakeDocument, fakeHost, withHost } from "../../support/vscode-fake";
import { extensionManifest } from "../../support/manifest";

/** Lumière's own entries in the shipped manifest (Lumière PDF's sit beside them). */
const manifest = extensionManifest();
const isMarkdownOwned = (id: string) => id.startsWith(SETTING_PREFIX);
const pkg = {
  contributes: {
    commands: manifest.contributes.commands.filter((entry) =>
      isMarkdownOwned(entry.command),
    ),
    customEditors: manifest.contributes.customEditors.filter((entry) =>
      isMarkdownOwned(entry.viewType),
    ),
    views: {
      explorer: (manifest.contributes.views?.explorer ?? []).filter((view) =>
        isMarkdownOwned(view.id),
      ),
    },
  },
};
const contributes = pkg.contributes;
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test("customEditors viewType matches MARKDOWN_EDITOR (runtime registration id)", () => {
  const viewTypes = contributes.customEditors.map(
    (editor: { viewType: string }) => editor.viewType,
  );
  assert.deepEqual(viewTypes, [MARKDOWN_EDITOR.viewType]);
  assert.equal(MARKDOWN_EDITOR.viewType, contributionId("editor"));
});

test("every contributed command id equals contributionId(local) and uses Workshop prefix", () => {
  for (const command of contributes.commands) {
    assert.match(command.command, /^lumiere\.markdown\./);
    assert.doesNotMatch(command.command, /markdownWorkbench/);
    const local = command.command.slice(SETTING_PREFIX.length);
    assert.equal(command.command, contributionId(local));
  }
});

test("owned when/enablement clauses do not use old prefix", () => {
  const blob = JSON.stringify(contributes);
  assert.equal(blob.includes("markdownWorkbench."), false);
});

test("runtime command registration matches contributes.commands", async () => {
  const captured = await captureRegisteredCommands();
  assert.deepEqual(captured.problems, []);
  // View-title sort/toggles register in tree host apply (not commandsHost).
  const tree = await captureTreeHostCommands();
  assert.deepEqual(tree.problems, []);
  const registered = new Set([...captured.ids, ...tree.ids]);
  const contributed = new Set(
    contributes.commands.map((command) => command.command),
  );
  const missing = [...contributed].filter((id) => !registered.has(id)).sort();
  const extra = [...captured.ids].filter((id) => !contributed.has(id)).sort();
  assert.deepEqual({ missing, extra }, { missing: [], extra: [] });
});

test("tree hosts register open and search commands outside contributes", async () => {
  const captured = await captureTreeHostCommands();
  assert.deepEqual(captured.problems, []);
  const contributed = new Set(
    contributes.commands.map((command) => command.command),
  );
  const outsideContributes = new Set([
    outlineOpenCommand,
    SEARCH_COMMAND,
    backlinksOpenCommand,
    outgoingOpenCommand,
    outgoingCreateCommand,
  ]);
  const capturedOutside = [...captured.ids]
    .filter((id) => !contributed.has(id))
    .sort();
  assert.deepEqual(capturedOutside, [...outsideContributes].sort());
  for (const id of capturedOutside) {
    assert.match(id, /^lumiere\.markdown\./);
    assert.doesNotMatch(id, /markdownWorkbench/);
  }
  const alsoContributed = [...captured.ids].filter(
    (id) => !outsideContributes.has(id),
  );
  assert.ok(alsoContributed.length > 0);
  for (const id of alsoContributed) {
    assert.equal(contributed.has(id), true);
  }
});

test("tree hosts register the explorer view ids from package.json", async () => {
  const captured = await captureTreeHostCommands();
  assert.deepEqual(captured.problems, []);
  const contributed = contributes.views.explorer.map((view) => view.id);
  assert.deepEqual([...captured.treeIds].sort(), [...contributed].sort());
});

test("editor host passes MARKDOWN_EDITOR.viewType to registerEditor", async () => {
  const viewTypes: string[] = [];
  const root = createRoot();
  provideHostServices(
    root,
    fakeHost({
      customEditors: {
        register(provider) {
          viewTypes.push(provider.viewType);
          return () => {};
        },
      },
    }),
  );
  root.provide("documents", {
    session() {
      throw new Error("unused");
    },
    release() {},
  });
  root.plugin(editorHost, { configure() {} });
  await root.settled();
  await tick();
  assert.deepEqual(pluginProblems(root), []);
  assert.deepEqual(viewTypes, [MARKDOWN_EDITOR.viewType]);
  await root.dispose();
});

async function loadManifests(): Promise<Manifest[]> {
  const manifests: Manifest[] = [];
  for (const directory of readdirSync("src/plugins", {
    withFileTypes: true,
  }).filter((entry) => entry.isDirectory())) {
    const file = path.resolve("src/plugins", directory.name, "manifest.ts");
    if (!existsSync(file)) {
      continue;
    }
    const loaded = (await import(pathToFileURL(file).href)) as {
      default: Manifest;
    };
    manifests.push(loaded.default);
  }
  return manifests;
}

function activePanel(): EditorPanel {
  return {
    id: "panel",
    column: 1,
    document: fakeDocument(),
    active: () => true,
    reveal() {},
    async dispose() {},
    rpc: {
      handle: () => () => {},
      notify() {},
      call: async () => undefined,
      on: () => () => {},
    },
  } as unknown as EditorPanel;
}

function capturingWorkbench(
  ids: Set<string>,
  manifests: readonly Manifest[],
): HostServices {
  const features = Object.fromEntries(
    manifests.map((manifest) => [manifest.id, { enabled: true, config: {} }]),
  );
  return fakeHost({
    hostCommands: {
      register(id) {
        ids.add(id);
        return () => {};
      },
    },
    settings: {
      forNote: () => ({ preset: "obsidian", mode: "source", features }),
    },
    workspace: {
      files: { readText: async () => "" } as unknown as WorkspaceFiles,
    },
  });
}

/** Registrars that are not a plugin `apply` (editor, outline, public API). */
function directRegistrations(selections: Selections): Plugin {
  return {
    name: "direct-command-registrations",
    inject: { required: [...HOST_SERVICE_NAMES, "editors", "vaults"] },
    provides: ["editorActions"],
    apply(ctx) {
      registerMarkdownAssociation(ctx);
      registerToggleTextEditor(ctx, ctx.editors);
      registerGoToLine(ctx, ctx.editors);
      registerJumpHistory(ctx, ctx.editors);
      registerEditorActions(ctx, ctx.editors, selections);
      registerPluginManagement(ctx, {} as never, {} as never);
      registerOpenReference(ctx, {} as never, {} as never);
      registerOutlineActions(ctx, {} as never, {} as never);
      registerSymbolPicker(ctx, ctx.dialogs);
    },
  };
}

function installHosts(
  root: BaseContext,
  manifests: readonly Manifest[],
  selections: Selections,
): void {
  root.plugin(commandsHost, { features: manifests });
  root.plugin(settingsHost);
  root.plugin(livePreviewHost);
  root.plugin(cursorBridgeHost);
  root.plugin(ideContextHost);
  root.plugin(graphHost);
  root.plugin(bridgeHost);
  root.plugin(wikiHost);
  root.plugin(scratchHost);
  root.plugin(marpHost);
  root.plugin(assetsHost);
  root.plugin(gitDiffEditorHost);
  root.plugin(quickSwitcherHost);
  root.plugin(linkUpdatesHost);
  root.plugin(obsidianMarketplaceHost);
  root.plugin(directRegistrations(selections));
}

async function captureRegisteredCommands(): Promise<{
  ids: Set<string>;
  problems: string[];
}> {
  const ids = new Set<string>();
  const manifests = await loadManifests();
  const root = createRoot();
  const panel = activePanel();
  const selections: Selections = {
    async capture() {
      return undefined;
    },
    validate: () => panel,
  };
  provideHostServices(root, capturingWorkbench(ids, manifests));
  root.provide("editors", {
    all: () => [panel],
    active: () => panel,
    async capture() {
      throw new Error("unused");
    },
    async restore() {},
  });
  root.provide("selections", selections);
  root.provide("vaults", {} as Vaults);
  root.provide("okf", {} as Okf);
  installHosts(root, manifests, selections);
  await root.settled();
  await tick();
  const problems = pluginProblems(root);
  await root.dispose();
  return { ids, problems };
}

async function captureTreeHostCommands(): Promise<{
  ids: Set<string>;
  treeIds: Set<string>;
  problems: string[];
}> {
  const ids = new Set<string>();
  const treeIds = new Set<string>();
  const root = createRoot();
  provideHostServices(root, viewHostWorkbench(ids, treeIds));
  root.provide("vaults", idleVaults());
  root.provide("editors", idleEditors());
  root.plugin(outlineHost);
  root.plugin(tagsViewHost);
  root.plugin(backlinksHost);
  root.plugin(outgoingLinksHost);
  root.provide("selections", {
    async capture() {
      return undefined;
    },
    validate: () => activePanel(),
  });
  root.plugin(cursorBridgeHost);
  await root.settled();
  await tick();
  const problems = pluginProblems(root);
  await root.dispose();
  return { ids, treeIds, problems };
}

/** Tree and status handles the view hosts touch while registering. */
function viewHostWorkbench(
  ids: Set<string>,
  treeIds: Set<string>,
): HostServices {
  return withHost(capturingWorkbench(ids, []), {
    views: {
      tree: (viewId) => {
        treeIds.add(viewId);
        return {
          refresh() {},
          setMessage() {},
          reveal: async () => {},
          visible: false,
          onVisibilityChanged: () => () => {},
          dispose() {},
        };
      },
    },
  });
}

/** Vault calls `apply` makes while refreshing; command callbacks are not run. */
function idleVaults(): Vaults {
  return {
    async forDocument() {
      throw new Error("unused");
    },
    async forWorkspace() {
      return undefined;
    },
    async locate() {
      return undefined;
    },
    async text() {
      return "";
    },
    async open() {},
    all: () => [],
    registerLinkPolicy: () => () => {},
    invalidateLinkResolution() {},
  };
}

function idleEditors(): Editors {
  return {
    active: () => undefined,
    all: () => [],
    async capture() {
      throw new Error("unused");
    },
    async restore() {},
  };
}

function pluginProblems(root: RootContext): string[] {
  return root.plugins.flatMap((child) => describePlugin(child));
}

function describePlugin(child: PluginHandle): string[] {
  if (child.state === "failed") {
    return [`${child.definition.name} failed: ${String(child.error)}`];
  }
  if (child.waitingFor.length > 0) {
    return [
      `${child.definition.name} waiting for ${child.waitingFor.join(", ")}`,
    ];
  }
  return [];
}
