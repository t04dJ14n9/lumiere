import assert from "node:assert/strict";
import { test } from "node:test";
// First: everything below imports 'vscode', which this points at the fake.
import "./support/install-fake-vscode";
import * as vscode from "./support/fake-vscode";
import { createRoot, type Plugin, type ServiceName } from "@workshop/core";
import { providePlatform, type HostPlatform } from "@workshop/platform";
import {
  nodeAgentFiles,
  nodeDigests,
  nodeRealPaths,
} from "@workshop/platform/node";
import { pdfPlugins } from "../../src/extension/plugins/catalog";
import { pdfDesktopPlugins } from "../../src/extension/desktop";

/** The desktop's catalog: every plugin. */
const plugins = pdfPlugins(pdfDesktopPlugins);

/**
 * Leave-no-trace tests: each plugin, and the whole catalog, started with a
 * fake VS Code and stopped again must leave no registration behind.
 */
const errors: string[] = [];
const log = {
  info() {},
  warn() {},
  error(message: string) {
    errors.push(message);
  },
};
const memento = () => {
  const values = new Map<string, unknown>();
  return {
    get: (key: string, fallback?: unknown) => values.get(key) ?? fallback,
    update: async (key: string, value: unknown) => {
      values.set(key, value);
    },
    keys: () => [...values.keys()],
  };
};
const context = {
  globalState: memento(),
  workspaceState: memento(),
  subscriptions: [],
  extensionUri: vscode.Uri.file("/extension"),
  globalStorageUri: vscode.Uri.file("/storage/global"),
  storageUri: vscode.Uri.file("/storage/workspace"),
};

const rootServices: readonly ServiceName[] = [
  "extensionContext",
  "outputChannel",
  "digests",
  "os",
];

/** The desktop's platform, and the browser's (no local disk, no agent files). */
const desktop: HostPlatform = {
  os: { platform: process.platform },
  digests: nodeDigests,
  workers: { start: () => assert.fail("PDF plugins start no workers") },
  realPaths: nodeRealPaths,
  agentFiles: nodeAgentFiles,
};
const browser: HostPlatform = {
  os: desktop.os,
  digests: desktop.digests,
  workers: desktop.workers,
};

function startRoot(selected: readonly Plugin[], platform = desktop) {
  const root = createRoot({
    logger: {
      debug() {},
      warn() {},
      error: (message) => void errors.push(message),
    },
  });
  root.provide("extensionContext", context as never);
  root.provide("outputChannel", log as never);
  providePlatform(root, platform);
  const handles = new Map(
    selected.map((plugin) => [plugin.name, root.plugin(plugin)]),
  );
  return { root, handles };
}

/** The plugin and, transitively, the providers of every service it requires. */
function withProviders(plugin: Plugin): Plugin[] {
  const required = (plugin.inject?.required ?? []).filter(
    (name) => !rootServices.includes(name),
  );
  const providers = required.map((name) => {
    const provider = plugins.find((item) => item.provides?.includes(name));
    assert.ok(
      provider,
      `${plugin.name} requires ${name}, which no plugin provides`,
    );
    return provider;
  });
  return [...new Set([...providers.flatMap(withProviders), plugin])];
}

async function startAndStop(
  selected: readonly Plugin[],
  platform = desktop,
): Promise<string[]> {
  errors.length = 0;
  const { root, handles } = startRoot(selected, platform);
  await root.settled();
  assert.deepEqual(errors, []);
  for (const [name, handle] of handles) {
    assert.equal(handle.state, "active", name);
  }
  const registered = vscode.outstanding();
  await root.dispose();
  assert.deepEqual(errors, [], "teardown logged errors");
  assert.deepEqual(root.ledger.snapshot(), {});
  assert.deepEqual(
    vscode.outstanding(),
    [],
    "registrations left after dispose",
  );
  return registered;
}

for (const plugin of plugins) {
  test(`${plugin.name}: started alone (with what it requires) and stopped, it leaves no registration`, async () => {
    const registered = await startAndStop(withProviders(plugin));
    assert.ok(registered.length > 0, `${plugin.name} registered nothing`);
  });
}

test("catalog: the whole catalog starts and stops without leaving a registration", async () => {
  const registered = await startAndStop(plugins);
  for (const kind of [
    "customEditor:pdfWorkshop.viewer",
    "command:pdfWorkshop.copyLinkForAgent",
    "command:vscodeEmbedPdf.bridge.envelope",
    "command:pdfWorkshop.copyMcpSetup",
  ]) {
    assert.ok(registered.includes(kind), kind);
  }
});

test("the browser's catalog starts and stops without leaving a registration, and hands nothing to agents", async () => {
  const registered = await startAndStop(pdfPlugins([]), browser);
  assert.ok(registered.includes("customEditor:pdfWorkshop.viewer"));
  assert.ok(registered.includes("command:pdfWorkshop.ideContext.copy"));
  for (const kind of [
    "command:pdfWorkshop.copyLinkForAgent",
    "command:vscodeEmbedPdf.bridge.envelope",
    "command:pdfWorkshop.copyMcpSetup",
  ]) {
    assert.ok(!registered.includes(kind), kind);
  }
});

test("toggle: a plugin can be turned off and on again without leaving a registration", async () => {
  const { root, handles } = startRoot(plugins);
  await root.settled();
  const all = vscode.outstanding();
  await handles.get("pdfOutline")!.dispose();
  assert.ok(!vscode.outstanding().some((kind) => kind.startsWith("treeView:")));
  root.plugin(plugins.find((plugin) => plugin.name === "pdfOutline")!);
  await root.settled();
  assert.deepEqual(vscode.outstanding().sort(), [...all].sort());
  await root.dispose();
  assert.deepEqual(vscode.outstanding(), []);
});

test("the check catches a registration a plugin does not hand to its context", async () => {
  const leaky: Plugin = {
    name: "leaky",
    apply() {
      vscode.commands.registerCommand("leaky.command");
    },
  };
  const { root } = startRoot([leaky]);
  await root.settled();
  await root.dispose();
  assert.deepEqual(vscode.outstanding(), ["command:leaky.command"]);
  vscode.forgetAll();
});
