import assert from "node:assert/strict";
import test from "node:test";
import { Context } from "../../../src/kernel";
import { codeBlocksHost } from "../../../src/plugins/codeBlocks/host";
import { protocol } from "../../../src/plugins/codeBlocks/protocol";
import { fixture } from "../copy-for-agent/fixture";

test("processor RPC enforces trust, source containment, feature enablement and owner lifetime", async () => {
  const f = fixture();
  let trusted = false;
  let enabled = true;
  const root = Context.create();
  root.provide("editors", f.editors);
  root.provide("workbench", {
    ...f.workbench,
    isTrusted: () => trusted,
    config: () => ({
      preset: "obsidian",
      mode: "livePreview",
      features: { codeBlocks: { enabled, config: {} } },
    }),
  });
  root.plugin(codeBlocksHost);
  let retained: Context["codeBlocks"] | undefined;
  const owner = root.plugin({
    name: "example",
    inject: { required: ["codeBlocks"] },
    apply(ctx) {
      retained = ctx.codeBlocks;
      ctx.codeBlocks.register({
        language: "demo",
        render: async () => ({ markdown: "ok" }),
      });
    },
  });
  await root.settled();
  const { epoch, revision } = await f.pair.client.call(protocol, "current", {});
  const request = {
    language: "demo",
    source: "",
    uri: f.panel.document.uri,
    sourceLine: 0,
    epoch,
    revision,
  };
  await assert.rejects(f.pair.client.call(protocol, "render", request), {
    code: "WorkspaceUntrusted",
  });
  trusted = true;
  await assert.rejects(
    f.pair.client.call(protocol, "render", {
      ...request,
      uri: "file:///outside.md",
    }),
    { code: "InvalidArgument" },
  );
  assert.deepEqual(await f.pair.client.call(protocol, "render", request), {
    markdown: "ok",
  });
  enabled = false;
  await assert.rejects(f.pair.client.call(protocol, "render", request), {
    code: "PluginDisabled",
  });
  enabled = true;
  await owner.dispose();
  assert.deepEqual(
    (await f.pair.client.call(protocol, "current", {})).languages,
    [],
  );
  assert.throws(
    () =>
      retained?.register({
        language: "late",
        render: async () => ({ html: "" }),
      }),
    { code: "PluginDisabled" },
  );
  await root.dispose();
  await assert.rejects(f.pair.client.call(protocol, "current", {}), {
    code: "PluginDisabled",
  });
  await f.pair.dispose();
});
