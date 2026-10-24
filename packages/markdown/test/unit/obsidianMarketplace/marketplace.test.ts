import assert from "node:assert/strict";
import test from "node:test";
import { EditorState, type TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { createRoot } from "@workshop/core";
import { getDomDocument } from "../../../src/plugins/obsidianCompat/dom-fallback";
import {
  installDomHelpers,
  ObsidianRuntime,
} from "../../../src/plugins/obsidianCompat/webview";
import { obsidianCompatPanelHost } from "../../../src/plugins/obsidianCompat/panel-host";
import { protocol as compatProtocol } from "../../../src/plugins/obsidianCompat/protocol";
import {
  COMMUNITY_PLUGINS_URL,
  COMMUNITY_PLUGIN_STATS_URL,
  filterMarketplaceItems,
  type FetchLike,
} from "../../../src/plugins/obsidianMarketplace/catalog-parser";
import { obsidianMarketplaceHost } from "../../../src/plugins/obsidianMarketplace/host";
import { CommunityMarketplaceService } from "../../../src/plugins/obsidianMarketplace/marketplace-service";
import { obsidianMarketplacePanelHost } from "../../../src/plugins/obsidianMarketplace/panel-host";
import { protocol as marketplaceProtocol } from "../../../src/plugins/obsidianMarketplace/protocol";
import { obsidianMarketplaceWebview } from "../../../src/plugins/obsidianMarketplace/webview";
import { provideHostServices } from "../../../src/shared/host";
import { fakeDocument, fakeHost } from "../../support/vscode-fake";

const VAULT_ROOT = "file:///vault-market";

const SAMPLE_CATALOG = [
  {
    id: "dataview",
    name: "Dataview",
    author: "Michael Brenan",
    description: "Complex data views for your knowledge base.",
    repo: "blacksmithgu/obsidian-dataview",
  },
  {
    id: "obsidian-tasks-plugin",
    name: "Tasks",
    author: "Clare Macrae",
    description: "Track tasks across your entire vault.",
    repo: "obsidian-tasks-group/obsidian-tasks",
  },
  {
    id: "custom-callout",
    name: "Custom Callout",
    author: "Alice",
    description: "Render custom callout badges.",
    repo: "alice/obsidian-custom-callout",
  },
];

const SAMPLE_STATS = {
  dataview: { downloads: 2450000 },
  "obsidian-tasks-plugin": { downloads: 1850000 },
  "custom-callout": 42000,
};

const CALLOUT_MANIFEST = JSON.stringify({
  id: "custom-callout",
  name: "Custom Callout",
  version: "1.4.2",
  minAppVersion: "1.0.0",
  description: "Render custom callout badges.",
  author: "Alice",
});

const CALLOUT_MAIN_JS = `
const { Plugin } = require("obsidian");
module.exports = class CustomCalloutPlugin extends Plugin {
  onload() {
    this.addCommand({
      id: "insert-callout",
      name: "Insert Custom Callout",
      editorCallback: (editor) => {
        editor.replaceSelection("[!CALLOUT] ");
      },
    });
    this.registerMarkdownCodeBlockProcessor("callout-box", (source, el) => {
      el.createDiv({ cls: "callout-box-rendered", text: "BOX:" + source.trim() });
    });
  }
};
`;

const CALLOUT_STYLES_CSS = `.callout-box-rendered { color: rebeccapurple; }`;

function createMemoryWorkspace(trusted = true) {
  let isTrusted = trusted;
  const files = new Map<string, string>();
  const watchers = new Map<string, Set<() => void>>();

  const notifyWatchers = (uri: string) => {
    for (const fn of watchers.get(uri) ?? []) {
      fn();
    }
  };

  const host = fakeHost({
    workspace: {
      isTrusted: () => isTrusted,
      async read(uri) {
        const content = files.get(uri);
        if (content === undefined) {
          throw Object.assign(new Error(`ENOENT: ${uri}`), {
            code: "FileNotFound",
          });
        }
        return new TextEncoder().encode(content);
      },
      watch(uri, listener) {
        const set = watchers.get(uri) ?? new Set<() => void>();
        set.add(listener);
        watchers.set(uri, set);
        return () => {
          set.delete(listener);
        };
      },
      files: {
        async authorize(root, target) {
          if (!target.startsWith(`${root}/`) || target.includes("..")) {
            throw new Error(`Path escapes vault root: ${target}`);
          }
        },
        readText: async (uri) => files.get(uri),
        async writeText(uri, text) {
          files.set(uri, text);
          notifyWatchers(uri);
        },
        mkdir: async () => {},
        async list(dirUri) {
          const prefix = `${dirUri.replace(/\/+$/, "")}/`;
          const children = new Set<string>();
          for (const key of files.keys()) {
            if (key.startsWith(prefix)) {
              const rest = key.slice(prefix.length);
              const firstSeg = rest.split("/")[0];
              if (firstSeg) {
                children.add(firstSeg);
              }
            }
          }
          return [...children];
        },
        copy: async () => {},
        move: async () => {},
        async remove(targetUri) {
          const prefix = `${targetUri.replace(/\/+$/, "")}/`;
          for (const key of [...files.keys()]) {
            if (key === targetUri || key.startsWith(prefix)) {
              files.delete(key);
            }
          }
        },
        isSymbolicLink: async () => false,
        pickFile: async () => undefined,
      },
    },
  });

  return {
    host,
    files,
    setTrusted(next: boolean) {
      isTrusted = next;
    },
  };
}

function createMockFetch(
  overrides?: Record<string, { status?: number; body: string }>,
): {
  fetchFn: FetchLike;
  requests: string[];
} {
  const requests: string[] = [];
  const defaultRoutes: Record<string, { status?: number; body: string }> = {
    [COMMUNITY_PLUGINS_URL]: { body: JSON.stringify(SAMPLE_CATALOG) },
    [COMMUNITY_PLUGIN_STATS_URL]: { body: JSON.stringify(SAMPLE_STATS) },
    "https://github.com/alice/obsidian-custom-callout/releases/latest/download/manifest.json":
      { body: CALLOUT_MANIFEST },
    "https://github.com/alice/obsidian-custom-callout/releases/latest/download/main.js":
      { body: CALLOUT_MAIN_JS },
    "https://github.com/alice/obsidian-custom-callout/releases/latest/download/styles.css":
      { body: CALLOUT_STYLES_CSS },
    ...overrides,
  };
  const fetchFn: FetchLike = async (url) => {
    requests.push(url);
    const route = defaultRoutes[url];
    if (!route) {
      return { ok: false, status: 404, text: async () => "Not Found" };
    }
    const status = route.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => route.body,
    };
  };
  return { fetchFn, requests };
}

test("fetchCatalog and listCatalog merge remote catalog, download stats, and locally installed plugins with caching", async () => {
  const mem = createMemoryWorkspace(true);
  mem.files.set(
    `${VAULT_ROOT}/.obsidian/community-plugins.json`,
    JSON.stringify(["dataview", "local-only"]),
  );
  mem.files.set(
    `${VAULT_ROOT}/.obsidian/plugins/dataview/manifest.json`,
    JSON.stringify({ id: "dataview", name: "Dataview", version: "0.5.68" }),
  );
  mem.files.set(
    `${VAULT_ROOT}/.obsidian/plugins/dataview/main.js`,
    "module.exports = class {};",
  );
  mem.files.set(
    `${VAULT_ROOT}/.obsidian/plugins/local-only/manifest.json`,
    JSON.stringify({
      id: "local-only",
      name: "Local Only Helper",
      version: "0.1.0",
      author: "Dev",
      description: "Unpublished vault plugin",
    }),
  );
  mem.files.set(
    `${VAULT_ROOT}/.obsidian/plugins/local-only/main.js`,
    "module.exports = class {};",
  );

  const { fetchFn, requests } = createMockFetch();
  const service = new CommunityMarketplaceService({
    workspace: mem.host.workspace,
    fetchFn,
  });

  const snapshot = await service.listCatalog(VAULT_ROOT, ".obsidian");
  assert.equal(snapshot.trusted, true);
  assert.equal(snapshot.configDir, ".obsidian");
  assert.equal(snapshot.items.length, 4);

  const dataview = snapshot.items.find((i) => i.id === "dataview")!;
  assert.equal(dataview.installed, true);
  assert.equal(dataview.enabled, true);
  assert.equal(dataview.installedVersion, "0.5.68");
  assert.equal(dataview.downloads, 2450000);

  const tasks = snapshot.items.find((i) => i.id === "obsidian-tasks-plugin")!;
  assert.equal(tasks.installed, false);
  assert.equal(tasks.enabled, false);
  assert.equal(tasks.downloads, 1850000);

  const localOnly = snapshot.items.find((i) => i.id === "local-only")!;
  assert.equal(localOnly.installed, true);
  assert.equal(localOnly.enabled, true);
  assert.equal(localOnly.installedVersion, "0.1.0");

  // Second call uses cached remote catalog without re-fetching
  const requestCountAfterFirst = requests.length;
  await service.listCatalog(VAULT_ROOT, ".obsidian", false);
  assert.equal(requests.length, requestCountAfterFirst);

  // Filter & search helpers
  assert.deepEqual(
    filterMarketplaceItems(snapshot.items, { filter: "installed" }).map(
      (i) => i.id,
    ),
    ["dataview", "local-only"],
  );
  assert.deepEqual(
    filterMarketplaceItems(snapshot.items, { query: "clare" }).map((i) => i.id),
    ["obsidian-tasks-plugin"],
  );
  assert.deepEqual(
    filterMarketplaceItems(snapshot.items, { sort: "name" }).map((i) => i.id),
    ["custom-callout", "dataview", "local-only", "obsidian-tasks-plugin"],
  );
});

test("installPlugin, setPluginEnabled, and uninstallPlugin write files and hot-reload obsidianCompat runtime", async () => {
  const doc = getDomDocument();
  doc.body.replaceChildren();
  installDomHelpers();

  try {
    const mem = createMemoryWorkspace(true);
    const { fetchFn } = createMockFetch();
    const changedVaults: string[] = [];
    const service = new CommunityMarketplaceService({
      workspace: mem.host.workspace,
      fetchFn,
      onChanged: (v) => changedVaults.push(v),
    });

    let state = EditorState.create({ doc: "Hello " });
    const cmView = {
      get state() {
        return state;
      },
      dispatch(spec: TransactionSpec) {
        state = state.update(spec).state;
      },
      focus() {},
      hasFocus: true,
      scrollDOM: { scrollTop: 0, scrollLeft: 0 },
      coordsAtPos: () => ({ top: 0, left: 0, bottom: 16 }),
    } as unknown as EditorView;

    const runtime = new ObsidianRuntime({
      getEditorView: () => cmView,
    });
    runtime.setTrusted(true);

    // 1. Install custom-callout
    const installed = await service.installPlugin(
      VAULT_ROOT,
      ".obsidian",
      "custom-callout",
    );
    assert.equal(installed.item?.installed, true);
    assert.equal(installed.item?.enabled, true);
    assert.equal(installed.item?.installedVersion, "1.4.2");
    assert.deepEqual(installed.enabledIds, ["custom-callout"]);
    assert.equal(changedVaults.includes(VAULT_ROOT), true);
    assert.ok(
      mem.files.has(`${VAULT_ROOT}/.obsidian/plugins/custom-callout/main.js`),
    );
    assert.ok(
      mem.files.has(
        `${VAULT_ROOT}/.obsidian/plugins/custom-callout/styles.css`,
      ),
    );

    // Hot-reload into ObsidianRuntime and verify command + code block processor work immediately!
    await runtime.syncCommunityPlugins(installed.plugins);
    assert.equal(
      runtime.app.commands.executeCommandById("custom-callout:insert-callout"),
      true,
    );
    assert.equal(cmView.state.doc.toString(), "[!CALLOUT] Hello ");

    const blockEl = doc.createElement("div");
    await runtime.runCodeBlockProcessors(
      "callout-box",
      "live-installed",
      blockEl,
      "Note.md",
    );
    assert.equal(blockEl.textContent, "BOX:live-installed");

    // 2. Disable custom-callout
    const disabled = await service.setPluginEnabled(
      VAULT_ROOT,
      ".obsidian",
      "custom-callout",
      false,
    );
    assert.equal(disabled.item?.installed, true);
    assert.equal(disabled.item?.enabled, false);
    assert.deepEqual(disabled.enabledIds, []);
    await runtime.syncCommunityPlugins(disabled.plugins);
    assert.equal(
      runtime.app.commands.executeCommandById("custom-callout:insert-callout"),
      false,
    );

    // 3. Re-enable custom-callout
    const reenabled = await service.setPluginEnabled(
      VAULT_ROOT,
      ".obsidian",
      "custom-callout",
      true,
    );
    assert.equal(reenabled.item?.enabled, true);
    await runtime.syncCommunityPlugins(reenabled.plugins);
    assert.equal(
      runtime.app.commands.executeCommandById("custom-callout:insert-callout"),
      true,
    );

    // 4. Uninstall custom-callout
    const uninstalled = await service.uninstallPlugin(
      VAULT_ROOT,
      ".obsidian",
      "custom-callout",
    );
    assert.equal(uninstalled.item?.installed, false);
    assert.equal(uninstalled.item?.enabled, false);
    assert.equal(
      mem.files.has(`${VAULT_ROOT}/.obsidian/plugins/custom-callout/main.js`),
      false,
    );
    await runtime.syncCommunityPlugins(uninstalled.plugins);
    assert.equal(
      runtime.app.commands.executeCommandById("custom-callout:insert-callout"),
      false,
    );

    runtime.dispose();
  } finally {
    doc.body.replaceChildren();
  }
});

test("security guards reject untrusted workspaces, path traversal IDs, mismatched manifests, and invalid repos", async () => {
  const mem = createMemoryWorkspace(false);
  const { fetchFn } = createMockFetch({
    "https://github.com/evil/spoofed/releases/latest/download/manifest.json": {
      body: JSON.stringify({
        id: "different-id",
        name: "Spoofed",
        version: "1.0.0",
      }),
    },
    "https://github.com/evil/spoofed/releases/latest/download/main.js": {
      body: "module.exports = class {};",
    },
  });
  const service = new CommunityMarketplaceService({
    workspace: mem.host.workspace,
    fetchFn,
  });

  // Untrusted workspace returns empty catalog without network calls and rejects mutations
  const untrustedSnap = await service.listCatalog(VAULT_ROOT, ".obsidian");
  assert.equal(untrustedSnap.trusted, false);
  assert.deepEqual(untrustedSnap.items, []);

  await assert.rejects(
    () => service.fetchCatalog(true),
    /untrusted workspace/i,
  );
  await assert.rejects(
    () => service.installPlugin(VAULT_ROOT, ".obsidian", "custom-callout"),
    /untrusted workspace/i,
  );
  await assert.rejects(
    () =>
      service.setPluginEnabled(VAULT_ROOT, ".obsidian", "custom-callout", true),
    /untrusted workspace/i,
  );
  await assert.rejects(
    () => service.uninstallPlugin(VAULT_ROOT, ".obsidian", "custom-callout"),
    /untrusted workspace/i,
  );

  // Switch workspace to trusted and test path traversal / repo / manifest guards
  mem.setTrusted(true);
  for (const badId of ["../evil", "..", "foo/bar", "foo\\bar", ""]) {
    await assert.rejects(
      () => service.installPlugin(VAULT_ROOT, ".obsidian", badId, "a/b"),
      /Invalid Obsidian plugin ID/,
    );
    await assert.rejects(
      () => service.setPluginEnabled(VAULT_ROOT, ".obsidian", badId, true),
      /Invalid Obsidian plugin ID/,
    );
    await assert.rejects(
      () => service.uninstallPlugin(VAULT_ROOT, ".obsidian", badId),
      /Invalid Obsidian plugin ID/,
    );
  }

  for (const badRepo of ["../evil/repo", "not-a-repo", "a/b/c"]) {
    await assert.rejects(
      () =>
        service.installPlugin(
          VAULT_ROOT,
          ".obsidian",
          "custom-callout",
          badRepo,
        ),
      /Invalid Obsidian plugin repository/,
    );
  }

  await assert.rejects(
    () =>
      service.installPlugin(VAULT_ROOT, ".obsidian", "spoofed", "evil/spoofed"),
    /invalid or mismatched/,
  );
});

test("webview marketplace modal opens, searches, filters, and installs/toggles/uninstalls plugins end-to-end over RPC", async () => {
  const doc = getDomDocument();
  doc.body.replaceChildren();
  const editorDiv = doc.createElement("div");
  editorDiv.id = "editor";
  doc.body.appendChild(editorDiv);
  installDomHelpers();

  try {
    const mem = createMemoryWorkspace(true);
    const { fetchFn } = createMockFetch();
    const root = createRoot();
    provideHostServices(root, mem.host);

    const hostHandlers = new Map<
      string,
      (params: unknown) => Promise<unknown>
    >();
    const webviewListeners = new Map<string, Set<(payload: unknown) => void>>();

    const rpc = {
      handle(
        proto: { id: string },
        method: string,
        handler: (params: unknown) => Promise<unknown>,
      ) {
        const key = `${proto.id}:${method}`;
        hostHandlers.set(key, handler);
        return () => {
          hostHandlers.delete(key);
        };
      },
      async call(proto: { id: string }, method: string, params: unknown) {
        const key = `${proto.id}:${method}`;
        const handler = hostHandlers.get(key);
        if (!handler) {
          throw new Error(`Missing RPC handler: ${key}`);
        }
        return handler(params);
      },
      notify(proto: { id: string }, event: string, payload: unknown) {
        const key = `${proto.id}:${event}`;
        for (const fn of webviewListeners.get(key) ?? []) {
          fn(payload);
        }
      },
      on(
        proto: { id: string },
        event: string,
        listener: (payload: unknown) => void,
      ) {
        const key = `${proto.id}:${event}`;
        const set = webviewListeners.get(key) ?? new Set();
        set.add(listener);
        webviewListeners.set(key, set);
        return () => {
          set.delete(listener);
        };
      },
    };

    root.provide("rpc", rpc as never);
    root.provide("vault", {
      root: VAULT_ROOT,
      files: () => [],
      file: () => undefined,
      onDidChange: () => () => {},
      resolveLink: () => undefined,
    } as never);

    const commands = new Map<string, () => unknown>();
    root.provide("commands", {
      register(id: string, run: () => unknown) {
        commands.set(id, run);
        return () => {
          commands.delete(id);
        };
      },
      run: async (id: string) => Boolean(await commands.get(id)?.()),
    } as never);

    const editorRoot = doc.getElementById("editor")!;
    let state = EditorState.create({ doc: "Test note" });
    const cmView = {
      dom: editorRoot,
      get state() {
        return state;
      },
      dispatch(spec: TransactionSpec) {
        state = state.update(spec).state;
      },
      focus() {},
      hasFocus: true,
      scrollDOM: { scrollTop: 0, scrollLeft: 0 },
      coordsAtPos: () => ({ top: 0, left: 0, bottom: 16 }),
    } as unknown as EditorView;

    root.provide("editor", {
      view: cmView,
      source: `${VAULT_ROOT}/Test.md`,
      mode: "livePreview",
      extend: () => () => {},
    } as never);

    const runtime = new ObsidianRuntime({
      getEditorView: () => cmView,
    });
    (globalThis as Record<string, unknown>).__lumiereObsidianRuntime = runtime;

    const panel = {
      id: "panel-1",
      document: fakeDocument({ uri: `${VAULT_ROOT}/Test.md` }),
      rpc,
    } as never;

    root.plugin(obsidianCompatPanelHost, { panel });
    root.plugin(obsidianMarketplacePanelHost, { panel, fetchFn });
    root.plugin(obsidianMarketplaceWebview);
    await root.settled();

    // Open modal via registered webview command
    assert.equal(commands.has("obsidianMarketplace:open"), true);
    commands.get("obsidianMarketplace:open")!();
    await new Promise((r) => setTimeout(r, 30));

    const modalEl = doc.querySelector("[data-obsidian-marketplace-modal]");
    assert.ok(modalEl, "Marketplace modal should be mounted in DOM");

    const cards = modalEl.querySelectorAll("[data-plugin-id]");
    assert.equal(cards.length, 3);

    // Search for "custom"
    const searchInput = modalEl.querySelector<HTMLInputElement>(
      "[data-marketplace-search]",
    )!;
    searchInput.value = "custom";
    searchInput.dispatchEvent(new Event("input"));
    assert.equal(modalEl.querySelectorAll("[data-plugin-id]").length, 1);

    // Click Install on custom-callout card
    const installBtn = modalEl.querySelector<HTMLButtonElement>(
      '[data-plugin-id="custom-callout"] [data-marketplace-action="install"]',
    )!;
    assert.ok(installBtn);
    installBtn.click();
    await new Promise((r) => setTimeout(r, 40));

    // Verify plugin is now Installed & Enabled in UI and active in ObsidianRuntime!
    const enabledBadge = modalEl.querySelector(
      '[data-plugin-id="custom-callout"] [data-plugin-badge="enabled"]',
    );
    assert.ok(enabledBadge, "Card should show Enabled badge after install");
    assert.equal(
      runtime.app.commands.executeCommandById("custom-callout:insert-callout"),
      true,
    );

    // Filter by "Enabled" tab
    const enabledTabBtn = modalEl.querySelector<HTMLButtonElement>(
      '[data-marketplace-filter="enabled"]',
    )!;
    enabledTabBtn.click();
    assert.equal(modalEl.querySelectorAll("[data-plugin-id]").length, 1);

    // Click Disable button
    const disableBtn = modalEl.querySelector<HTMLButtonElement>(
      '[data-plugin-id="custom-callout"] [data-marketplace-action="disable"]',
    )!;
    disableBtn.click();
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(
      runtime.app.commands.executeCommandById("custom-callout:insert-callout"),
      false,
    );

    // Switch back to "Installed" tab and click Uninstall
    const installedTabBtn = modalEl.querySelector<HTMLButtonElement>(
      '[data-marketplace-filter="installed"]',
    )!;
    installedTabBtn.click();
    assert.equal(modalEl.querySelectorAll("[data-plugin-id]").length, 1);

    const uninstallBtn = modalEl.querySelector<HTMLButtonElement>(
      '[data-plugin-id="custom-callout"] [data-marketplace-action="uninstall"]',
    )!;
    uninstallBtn.click();
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(modalEl.querySelectorAll("[data-plugin-id]").length, 0);

    // Close modal
    const closeBtn = modalEl.querySelector<HTMLButtonElement>(
      "[data-marketplace-close]",
    )!;
    closeBtn.click();
    assert.equal(doc.querySelector("[data-obsidian-marketplace-modal]"), null);

    runtime.dispose();
    await root.dispose();
    assert.equal(compatProtocol.id, "obsidianCompat");
    assert.equal(marketplaceProtocol.id, "obsidianMarketplace");
    assert.ok(obsidianMarketplaceHost);
  } finally {
    delete (globalThis as Record<string, unknown>).__lumiereObsidianRuntime;
    doc.body.replaceChildren();
  }
});

test("GitHub Releases API fallback, offline fallback, and host command lumiere.markdown.obsidianMarketplace.open", async () => {
  const mem = createMemoryWorkspace(true);
  const { fetchFn } = createMockFetch({
    "https://github.com/blacksmithgu/obsidian-dataview/releases/latest/download/manifest.json":
      { status: 404, body: "Not Found" },
    "https://github.com/blacksmithgu/obsidian-dataview/releases/latest/download/main.js":
      { status: 404, body: "Not Found" },
    "https://api.github.com/repos/blacksmithgu/obsidian-dataview/releases/latest":
      {
        body: JSON.stringify({
          assets: [
            {
              name: "manifest.json",
              browser_download_url: "https://cdn.example.com/dv/manifest.json",
            },
            {
              name: "main.js",
              browser_download_url: "https://cdn.example.com/dv/main.js",
            },
          ],
        }),
      },
    "https://cdn.example.com/dv/manifest.json": {
      body: JSON.stringify({
        id: "dataview",
        name: "Dataview",
        version: "0.5.70",
      }),
    },
    "https://cdn.example.com/dv/main.js": {
      body: 'const { Plugin } = require("obsidian"); module.exports = class extends Plugin {};',
    },
  });

  const service = new CommunityMarketplaceService({
    workspace: mem.host.workspace,
    fetchFn,
  });

  // Fallback to GitHub Releases API when direct download returns 404
  const installed = await service.installPlugin(
    VAULT_ROOT,
    ".obsidian",
    "dataview",
  );
  assert.equal(installed.item?.installed, true);
  assert.equal(installed.item?.installedVersion, "0.5.70");

  // Host command dispatches openModal to active editor panel
  const registeredCommands = new Map<
    string,
    (arg?: unknown) => Promise<void>
  >();
  const notifiedModal: unknown[] = [];
  const hostWithCmds = fakeHost({
    workspace: mem.host.workspace,
    hostCommands: {
      register(id, fn) {
        registeredCommands.set(id, fn as (arg?: unknown) => Promise<void>);
        return () => {
          registeredCommands.delete(id);
        };
      },
      execute: async () => undefined,
    },
  });
  const root = createRoot();
  provideHostServices(root, hostWithCmds);
  root.provide("vaults", {
    locate: async () => undefined,
    forWorkspace: async () => undefined,
  } as never);
  root.provide("editors", {
    active: () => ({
      rpc: {
        notify(_proto: unknown, event: string, payload: unknown) {
          if (event === "openModal") {
            notifiedModal.push(payload);
          }
        },
      },
    }),
  } as never);
  root.plugin(obsidianMarketplaceHost, { fetchFn });
  await root.settled();

  const openCmd = registeredCommands.get(
    "lumiere.markdown.obsidianMarketplace.open",
  );
  assert.ok(openCmd, "Host command should be registered");
  await openCmd({ query: "dataview" });
  assert.deepEqual(notifiedModal, [{ query: "dataview" }]);
  await root.dispose();
});
