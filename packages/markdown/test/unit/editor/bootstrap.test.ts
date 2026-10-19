import { MARKDOWN_EDITOR } from "../../../src/shared/editor-provider";
import test from "node:test";
import assert from "node:assert/strict";
import type { RuntimePluginState } from "../../../src/shared/plugin-state";
import { bootstrap } from "../../../src/host/bootstrap";
import type { PanelShell } from "../../../src/shared/host";
import { fakeDocument, fakeHost } from "../../support/vscode-fake";
import { fakeViews } from "../views/fakes";
import { MemoryFileSystem, memorySystem, wait } from "../vault/memory-fs";

/** Plugins that never started, with what each is still waiting for. */
function stalled(states: readonly RuntimePluginState[]): string[] {
  return states
    .filter((plugin) => plugin.state !== "active")
    .map(
      (plugin) =>
        `${plugin.id} is ${plugin.state}` +
        (plugin.waitingFor.length
          ? `, waiting for ${plugin.waitingFor.join(", ")}`
          : "") +
        (plugin.error ? `: ${plugin.error}` : ""),
    );
}

function shell(uri: string): PanelShell {
  return {
    id: "panel",
    column: undefined,
    document: fakeDocument({ uri }),
    cspSource: "test",
    trusted: false,
    transport: { send() {}, listen: () => () => {} },
    active: () => true,
    reveal() {},
    dispose() {},
    setHTML() {},
    asset: (path) => path,
    resource: (uri) => uri,
    onDispose: () => () => {},
    onState: () => () => {},
  };
}

// Panel kernels are isolated from the window kernel, so a service the window
// provides reaches a panel only when it is handed over explicitly. A missing
// handover leaves the panel's plugins waiting forever without any error.
test("the real host wiring starts every window and panel plugin", async () => {
  {
    let open: (panel: PanelShell) => void = () => {};
    const host = fakeHost({
      settings: { forNote: () => ({ preset: "obsidian", mode: "source" }) },
      customEditors: {
        register: (_provider, callback) => {
          open = callback;
          return () => {};
        },
      },
    });
    host.views = fakeViews().views;
    host.storage = {
      get: (_key, fallback) => fallback,
      update: async () => {},
    };
    const fs = new MemoryFileSystem({ "A.md": "[[B]]", "B.md": "" });
    const root = await bootstrap(host, memorySystem(fs).value);
    await wait();
    assert.deepEqual(stalled(root.service("pluginStates")?.list() ?? []), []);

    open(shell("memory:///vault/A.md"));
    const panel = root.service("editors")?.all()[0];
    assert.ok(panel, "opening an editor creates a panel");
    await root.settled();
    await wait();
    assert.deepEqual(stalled(panel.pluginStates?.() ?? []), []);
    await root.dispose();
  }
});

// VS Code resolves an editor as soon as the provider is registered, while
// activation is still running. If the editor host then restarted (for example
// because a service it injects arrived late), it would unregister the provider
// and close that editor: "The editor could not be opened".
test("the editor provider registers once, so an editor opened during activation stays open", async () => {
  let registrations = 0;
  let unregistrations = 0;
  let disposed = false;
  const host = fakeHost({
    settings: { forNote: () => ({ preset: "obsidian", mode: "source" }) },
    customEditors: {
      register: (provider, open) => {
        registrations++;
        // The adapter learns everything about the editor from its provider.
        assert.equal(provider, MARKDOWN_EDITOR);
        const opened = shell("memory:///vault/A.md");
        opened.dispose = () => {
          disposed = true;
        };
        open(opened);
        return () => {
          unregistrations++;
        };
      },
    },
  });
  host.views = fakeViews().views;
  const fs = new MemoryFileSystem({ "A.md": "" });
  const root = await bootstrap(host, memorySystem(fs).value);
  await wait();
  assert.equal(registrations, 1);
  assert.equal(unregistrations, 0);
  assert.equal(disposed, false);
  await root.dispose();
});
