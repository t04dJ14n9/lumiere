import test from "node:test";
import assert from "node:assert/strict";
import { Context } from "../../../src/kernel";
import { editorHost } from "../../../src/plugins/editor/host";
import type { PanelShell } from "../../../src/shared/runtime";
import type { DocumentSession } from "../../../src/plugins/document/api";
import type { Vaults } from "../../../src/plugins/vault/api";
import { fakeDocument, fakeWorkbench } from "../../support/vscode-fake";

test("independent panel kernels share the injected vault registry before feature configuration", async () => {
  const root = Context.create();
  let open: (panel: PanelShell) => void = () => {};
  const contexts: Context[] = [];
  const vaults = {
    forDocument: async () => {
      throw new Error("Unused");
    },
  } as unknown as Vaults;
  root.provide("vaults", vaults);
  root.provide("documents", {
    session: () => ({}) as DocumentSession,
    release() {},
  });
  root.provide(
    "workbench",
    fakeWorkbench({
      registerEditor: (callback) => {
        open = callback;
        return () => {};
      },
    }),
  );
  root.plugin(editorHost, {
    configure: (context) => {
      assert.equal(context.runtime.value("vaults"), vaults);
      contexts.push(context);
    },
  });
  await root.settled();
  const shells = ["one", "two"].map((id) => {
    let close = () => {};
    return {
      id,
      document: fakeDocument(),
      cspSource: "test",
      trusted: false,
      transport: { send() {}, listen: () => () => {} },
      active: () => false,
      reveal() {},
      dispose() {
        close();
      },
      setHTML() {},
      asset: (path) => path,
      resource: (uri) => uri,
      onDispose: (listener) => {
        close = listener;
        return () => {};
      },
      onState: () => () => {},
    } satisfies PanelShell;
  });
  shells.forEach(open);
  assert.equal(contexts.length, 2);
  assert.notEqual(contexts[0]?.runtime, contexts[1]?.runtime);
  assert.notEqual(contexts[0]?.runtime, root.runtime);
  assert.notEqual(
    contexts[0]?.runtime.value("rpc"),
    contexts[1]?.runtime.value("rpc"),
  );
  await root.dispose();
});
