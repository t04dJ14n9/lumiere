import test from "node:test";
import assert from "node:assert/strict";
import { Context } from "../../../src/kernel";
import { Endpoint } from "../../../src/shared/rpc/endpoint";
import { inlineTitleHost } from "../../../src/plugins/inlineTitle/host";
import { protocol } from "../../../src/plugins/inlineTitle/protocol";
import type { EditorPanel, Editors } from "../../../src/plugins/editor/api";
import { fakeDocument, fakeWorkbench } from "../../support/vscode-fake";

function endpoints() {
  let hostReceive = (_value: unknown) => {};
  let clientReceive = (_value: unknown) => {};
  const clock = { after: () => () => {} };
  const host = new Endpoint(
    {
      send: (value) => clientReceive(value),
      listen: (receive) => {
        hostReceive = receive;
        return () => {};
      },
    },
    clock,
  );
  const client = new Endpoint(
    {
      send: (value) => hostReceive(value),
      listen: (receive) => {
        clientReceive = receive;
        return () => {};
      },
    },
    clock,
  );
  return { host, client };
}

test("inline title host owns resource-enabled RPC handlers and reports rename errors", async () => {
  const { host, client } = endpoints();
  const root = Context.create();
  let enabled = true;
  let configurationChanged = () => {};
  const errors: string[] = [];
  const panel = {
    id: "panel",
    document: fakeDocument(),
    rpc: host,
    session: { withAction: async <T>(action: () => Promise<T>) => action() },
  } as EditorPanel;
  root.provide("editors", {
    all: () => [panel],
    active: () => panel,
    capture: async () => {
      throw new Error("Unexpected capture");
    },
    restore: async () => {},
  } satisfies Editors);
  root.provide(
    "workbench",
    fakeWorkbench({
      renameFile: async () => {},
      config: () => ({
        preset: "obsidian",
        mode: "source",
        features: { inlineTitle: { enabled, config: {} } },
      }),
      error: (message) => errors.push(message),
      onConfiguration: (callback) => {
        configurationChanged = callback;
        return () => {
          configurationChanged = () => {};
        };
      },
    }),
  );
  const fiber = root.plugin(inlineTitleHost);
  await root.settled();
  assert.equal(fiber.state, "active");
  assert.deepEqual(await client.call(protocol, "rename", { title: "Note" }), {
    title: "Note",
  });
  const failure = await client.call(protocol, "rename", { title: "../escape" });
  assert.match(failure.error ?? "", /file name/);
  assert.equal(errors.length, 1);
  enabled = false;
  configurationChanged();
  await assert.rejects(client.call(protocol, "rename", { title: "Note" }), {
    code: "PluginDisabled",
  });
  enabled = true;
  configurationChanged();
  assert.equal(
    (await client.call(protocol, "rename", { title: "Note" })).title,
    "Note",
  );
  await root.dispose();
  await assert.rejects(client.call(protocol, "rename", { title: "Note" }), {
    code: "PluginDisabled",
  });
  await host.dispose();
  await client.dispose();
});
