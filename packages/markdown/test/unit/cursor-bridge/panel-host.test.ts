import test from "node:test";
import assert from "node:assert/strict";
import { createRoot } from "@workshop/core";
import { cursorBridgePanelHost } from "../../../src/plugins/cursorBridge/panel-host";
import { protocol } from "../../../src/plugins/cursorBridge/protocol";
import { provideHostServices } from "../../../src/shared/host";
import type { PanelShell } from "../../../src/shared/host";
import { fakeHost } from "../../support/vscode-fake";
import { rpcPair } from "../../support/rpc-pair";

async function panelHost(appName: string) {
  const root = createRoot();
  const pair = rpcPair();
  const executed: string[] = [];
  root.provide("rpc", pair.host);
  provideHostServices(
    root,
    fakeHost({
      agentHost: { appName },
      hostCommands: {
        execute: async (id) => {
          executed.push(id);
          return undefined;
        },
      },
    }),
  );
  root.plugin(cursorBridgePanelHost, { panel: {} as PanelShell });
  await root.settled();
  return { root, client: pair.client, executed };
}

test("the webview learns whether it runs in Cursor", async () => {
  for (const [appName, cursor] of [
    ["Cursor", true],
    ["Visual Studio Code", false],
  ] as const) {
    const { root, client } = await panelHost(appName);
    assert.equal(await client.call(protocol, "isCursor", {}), cursor);
    await root.dispose();
  }
});

test("Cmd/Ctrl+L and Cmd/Ctrl+K from the webview run Cursor Chat and Edit", async () => {
  const { root, client, executed } = await panelHost("Cursor");
  assert.equal(await client.call(protocol, "handOff", { mode: "chat" }), true);
  assert.equal(await client.call(protocol, "handOff", { mode: "edit" }), true);
  assert.deepEqual(executed, [
    "markdownWorkshop.cursorBridge.chat",
    "markdownWorkshop.cursorBridge.edit",
  ]);
  await root.dispose();
});
