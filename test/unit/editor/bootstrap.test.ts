import { MARKDOWN_EDITOR } from "../../../src/shared/editor-provider";
import test from "node:test";
import assert from "node:assert/strict";
import { Context } from "../../../src/kernel";
import { bootstrap } from "../../../src/host/bootstrap";
import type { PanelShell } from "../../../src/shared/runtime";
import { fakeDocument, fakeWorkbench } from "../../support/vscode-fake";
import { fakeViews } from "../views/fakes";
import { MemoryFileSystem, memorySystem, wait } from "../vault/memory-fs";

/** Fibers that never started, with what each is still waiting for. */
function stalled(context: Context): string[] {
  return [...context.runtime.fibers]
    .filter((fiber) => fiber.state !== "active")
    .map(
      (fiber) =>
        `${fiber.definition.name} is ${fiber.state}` +
        (fiber.waitingFor.length
          ? `, waiting for ${fiber.waitingFor.join(", ")}`
          : "") +
        (fiber.error ? `: ${String(fiber.error)}` : ""),
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
  const panels: Context[] = [];
  const create = Context.create;
  Context.create = (...args) => {
    const context = create.apply(Context, args);
    panels.push(context);
    return context;
  };
  try {
    let open: (panel: PanelShell) => void = () => {};
    const workbench = fakeWorkbench({
      config: () => ({ preset: "obsidian", mode: "source" }),
      registerEditor: (_provider, callback) => {
        open = callback;
        return () => {};
      },
    });
    workbench.views = fakeViews().views;
    workbench.storage = {
      get: (_key, fallback) => fallback,
      update: async () => {},
    };
    const fs = new MemoryFileSystem({ "A.md": "[[B]]", "B.md": "" });
    const root = await bootstrap(workbench, memorySystem(fs).value);
    await wait();
    assert.deepEqual(stalled(root), []);

    panels.length = 0;
    open(shell("memory:///vault/A.md"));
    const panel = panels[0];
    assert.ok(panel, "opening an editor creates a panel kernel");
    await panel.settled();
    await wait();
    assert.deepEqual(stalled(panel), []);
    await root.dispose();
  } finally {
    Context.create = create;
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
  const workbench = fakeWorkbench({
    config: () => ({ preset: "obsidian", mode: "source" }),
    registerEditor: (provider, open) => {
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
  });
  workbench.views = fakeViews().views;
  const fs = new MemoryFileSystem({ "A.md": "" });
  const root = await bootstrap(workbench, memorySystem(fs).value);
  await wait();
  assert.equal(registrations, 1);
  assert.equal(unregistrations, 0);
  assert.equal(disposed, false);
  await root.dispose();
});
