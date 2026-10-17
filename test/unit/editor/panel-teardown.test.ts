import test from "node:test";
import assert from "node:assert/strict";
import { createRoot } from "@workshop/core";
import { editorHost } from "../../../src/plugins/editor/host";
import type { PanelShell } from "../../../src/shared/runtime";
import type { DocumentSession } from "../../../src/plugins/document/api";
import { fakeDocument, fakeWorkbench } from "../../support/vscode-fake";

function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, opened };
}
const turn = () => new Promise<void>((resolve) => setImmediate(resolve));

/** The real editor host, opening one real panel through `createPanel`. */
async function hostWithPanel() {
  const errors: string[] = [];
  const order: string[] = [];
  const cleanup = gate();
  const root = createRoot({
    logger: {
      debug() {},
      warn() {},
      error: (message: string, error?: unknown) =>
        void errors.push(`${message}: ${String(error)}`),
    },
  });
  let open: (panel: PanelShell) => void = () => {};
  root.provide("documents", {
    session: () => ({}) as DocumentSession,
    release: () => void order.push("document released"),
  });
  root.provide(
    "workshop",
    fakeWorkbench({
      registerEditor: (_provider, callback) => {
        open = callback;
        return () => {};
      },
    }),
  );
  root.on("editor/closed", () => void order.push("closed event"));
  root.plugin(editorHost, {
    configure: (context) => {
      // A panel plugin whose cleanup takes a while.
      context.effect(() => async () => {
        await cleanup.opened;
        order.push("panel cleanup");
      });
    },
  });
  await root.settled();
  let close = () => {};
  let shellDisposed = 0;
  const shell = {
    id: "one",
    column: undefined,
    document: fakeDocument(),
    cspSource: "test",
    trusted: false,
    transport: { send() {}, listen: () => () => {} },
    active: () => true,
    reveal() {},
    dispose() {
      shellDisposed++;
      close();
    },
    setHTML() {},
    asset: (path) => path,
    resource: (uri) => uri,
    onDispose: (listener) => {
      close = listener;
      return () => {
        close = () => {};
      };
    },
    onState: () => () => {},
  } satisfies PanelShell;
  open(shell);
  return {
    root,
    errors,
    order,
    cleanup,
    nativeClose: () => shell.dispose(),
    shellDisposed: () => shellDisposed,
  };
}

test("stopping the editor host closes an open panel and waits for its whole cleanup", async () => {
  const { root, errors, order, cleanup, shellDisposed } = await hostWithPanel();
  let disposed = false;
  const disposal = root.dispose().then(() => (disposed = true));
  await turn();
  assert.equal(disposed, false, "host stopped before its panel's cleanup");
  cleanup.open();
  await disposal;
  assert.deepEqual(errors, []);
  assert.ok(order.includes("panel cleanup"), "panel cleanup skipped");
  assert.ok(order.includes("document released"), "document not released");
  // The host is stopping: no event through its dead context.
  assert.ok(!order.includes("closed event"));
  assert.equal(shellDisposed(), 1);
  assert.deepEqual(root.ledger.snapshot(), {});
});

test("VS Code closing a panel while the host stops shares one panel shutdown", async () => {
  const { root, errors, order, cleanup, nativeClose, shellDisposed } =
    await hostWithPanel();
  nativeClose();
  let disposed = false;
  const disposal = root.dispose().then(() => (disposed = true));
  await turn();
  assert.equal(disposed, false, "host stopped before the closing panel");
  cleanup.open();
  await disposal;
  assert.deepEqual(errors, []);
  assert.equal(order.filter((step) => step === "panel cleanup").length, 1);
  assert.equal(order.filter((step) => step === "closed event").length, 1);
  assert.equal(shellDisposed(), 1);
});
