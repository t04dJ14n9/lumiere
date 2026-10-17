import test from "node:test";
import assert from "node:assert/strict";
import { createRoot, Schema } from "@workshop/core";
import { defineProtocol } from "../../../src/shared/rpc/protocol";
import { registerEditorSettings } from "../../../src/webview/editor-settings";
import { pluginReporting } from "../../../src/webview/plugin-reporting";
import { protocol } from "../../../src/plugins/editor/protocol";
import { config as editorConfig } from "../../../src/plugins/editor/manifest";
import { rpcPair } from "../../support/rpc-pair";

function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, opened };
}

const probe = defineProtocol("test.probe", {
  requests: {
    read: { params: Schema.object({}), result: Schema.number() },
  },
  notifications: {},
});

test("a request after configureEditor sees the settings applied, however long the update takes", async () => {
  const pair = rpcPair();
  const root = createRoot();
  const applied = gate();
  const initial = editorConfig.parse({});
  const editor = {
    config: { editor: initial },
    async update(config: { editor: typeof initial }) {
      await applied.opened;
      this.config = config;
    },
  };
  registerEditorSettings(root, pair.client, editor);
  pair.client.handle(probe, "read", () => editor.config.editor.tabSize);
  pair.host.notify(protocol, "configureEditor", { ...initial, tabSize: 7 });
  const read = pair.host.call(probe, "read", {});
  await new Promise<void>((resolve) => setImmediate(resolve));
  applied.open();
  assert.equal(await read, 7);
  await root.dispose();
});

test("a request after configure sees the feature settings applied", async () => {
  const pair = rpcPair();
  const root = createRoot();
  const applied = gate();
  let current = "old";
  pluginReporting(root, pair.client, async () => {
    await applied.opened;
    current = "new";
  });
  pair.client.handle(probe, "read", () => (current === "new" ? 1 : 0));
  pair.host.notify(protocol, "configure", {});
  const read = pair.host.call(probe, "read", {});
  await new Promise<void>((resolve) => setImmediate(resolve));
  applied.open();
  assert.equal(await read, 1);
  await root.dispose();
});
