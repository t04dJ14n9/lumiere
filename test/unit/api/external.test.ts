import assert from "node:assert/strict";
import test from "node:test";
import type {
  ExternalContext,
  ExternalPlugin,
} from "../../../src/host/api/types";
import { protocol as markers } from "../../../src/plugins/markers/protocol";
import { protocol as actions } from "../../../src/plugins/editor/actions-protocol";
import { protocol as codeBlocks } from "../../../src/plugins/codeBlocks/protocol";
import { fixture, uri } from "./fixture";
const definition: ExternalPlugin = {
  id: "sample.notes",
  ownerExtensionId: "sample.provider",
  title: "Sample",
  description: "Test provider",
  defaultEnabled: true,
  apply() {},
};

test("external plugins are real isolated fibers with owned markers, actions, commands, processors and link claims", async () => {
  const f = await fixture();
  let retained!: ExternalContext;
  let runs = 0;
  let cleaned = 0;
  const plugin = f.api.plugin({
    ...definition,
    inject: {
      required: ["editors", "markers", "commands", "codeBlocks"],
      optional: ["vault", "agent"],
    },
    apply(ctx) {
      retained = ctx;
      for (const key of [
        "runtime",
        "rpc",
        "workbench",
        "provide",
        "plugin",
        "__proto__",
      ]) {
        assert.throws(() => Reflect.get(ctx, key), {
          code: "UndeclaredService",
        });
      }
      ctx.effect(() => () => {
        cleaned++;
      });
      ctx.commands.register("sample.provider.inspect", () => {
        runs++;
      });
      ctx.markers.registerAction("inspect", () => {
        runs++;
      });
      ctx.editors.registerSelectionAction({
        id: "selection",
        label: "Inspect",
        run({ selection }) {
          assert.ok(selection);
          assert.equal(selection.editorId, "panel");
          runs++;
        },
      });
      ctx.editors.registerTitleAction({
        id: "title",
        label: "Inspect note",
        run() {
          runs++;
        },
      });
      ctx.codeBlocks.register({
        language: "sample",
        render: (source, context, token) => {
          assert.equal(context.uri.scheme, "file");
          assert.equal(token.isCancellationRequested, false);
          return { markdown: source };
        },
      });
      ctx.on("links/open", (request) =>
        request.href.startsWith("sample:") ? true : undefined,
      );
    },
  });
  await plugin.settled();
  assert.equal(plugin.state.state, "active");
  const marker = {
    id: "one",
    from: 5,
    to: 8,
    documentVersion: 1,
    label: "Inspect",
    actionId: "inspect",
  };
  plugin.setMarkers("panel", [marker]);
  assert.equal(
    (await f.pair.client.call(markers, "current", {})).owners[plugin.id]?.[0]
      ?.from,
    4,
  );
  assert.equal(
    (await f.second.client.call(markers, "current", {})).owners[plugin.id],
    undefined,
  );
  assert.equal(
    await f.pair.client.call(markers, "activate", {
      owner: plugin.id,
      markerId: "one",
    }),
    true,
  );
  assert.equal(
    await f.pair.client.call(actions, "run", {
      owner: plugin.id,
      id: "selection",
    }),
    true,
  );
  f.commands.get("sample.provider.inspect")?.();
  assert.equal(runs, 3);
  const { epoch, revision } = await f.pair.client.call(
    codeBlocks,
    "current",
    {},
  );
  assert.deepEqual(
    await f.pair.client.call(codeBlocks, "render", {
      language: "sample",
      source: "result",
      uri: f.panel.document.uri,
      sourceLine: 0,
      epoch,
      revision,
    }),
    { markdown: "result" },
  );
  assert.equal(
    await f.root.bail("links/open", {
      href: "sample:one",
      source: f.panel.document.uri,
      editorId: "panel",
      wiki: false,
      side: false,
    }),
    true,
  );
  assert.equal(
    f.root.bail("links/open", {
      href: "other:one",
      source: f.panel.document.uri,
      editorId: "panel",
      wiki: false,
      side: false,
    }),
    undefined,
  );
  await f.api.setPluginEnabled(plugin.id, false, { target: "global" });
  assert.equal(plugin.state.state, "disabled");
  assert.equal(cleaned, 1);
  assert.equal(f.commands.has("sample.provider.inspect"), false);
  assert.deepEqual(
    (await f.pair.client.call(markers, "current", {})).owners,
    {},
  );
  assert.deepEqual(await f.pair.client.call(actions, "current", {}), []);
  assert.throws(() => retained.editors.getEditors(), {
    code: "PluginDisabled",
  });
  await f.api.resetPluginOverride(plugin.id, { target: "global" });
  assert.equal(plugin.state.state, "active");
  assert.equal((await f.pair.client.call(actions, "current", {})).length, 2);
  plugin.dispose();
  await plugin.settled();
  assert.equal(cleaned, 2);
  assert.equal(
    f.api.getPluginCatalog().some((item) => item.id === plugin.id),
    false,
  );
  await f.dispose();
});

test("external ownership validation, undeclared services and failed apply are isolated", async () => {
  const f = await fixture();
  assert.throws(
    () => f.api.plugin({ ...definition, ownerExtensionId: "missing.provider" }),
    { code: "InvalidArgument" },
  );
  assert.throws(() => f.api.plugin({ ...definition, id: "other.notes" }), {
    code: "InvalidArgument",
  });
  assert.throws(
    () =>
      f.api.plugin({
        ...definition,
        inject: { required: ["rpc" as "markers"] },
      }),
    { code: "InvalidArgument" },
  );
  const bad = f.api.plugin({
    ...definition,
    apply(ctx) {
      ctx.editors.getEditors();
    },
  });
  await bad.settled();
  assert.equal(bad.state.state, "failed");
  assert.throws(() => f.api.plugin(definition), {
    code: "DuplicateContribution",
  });
  const good = f.api.plugin({
    ...definition,
    id: "sample.good",
    inject: { required: ["commands"] },
    apply(ctx) {
      assert.throws(() => ctx.commands.register("foreign.command", () => {}), {
        code: "InvalidArgument",
      });
    },
  });
  await good.settled();
  assert.equal(good.state.state, "active");
  assert.equal(f.api.getEditors().length, 2);
  bad.dispose();
  good.dispose();
  await good.settled();
  await f.dispose();
});

test("resource disable removes markers and actions for that note without stopping globally enabled provider", async () => {
  const f = await fixture();
  let retained!: ExternalContext;
  const plugin = f.api.plugin({
    ...definition,
    inject: { required: ["markers", "editors", "codeBlocks"] },
    apply(ctx) {
      retained = ctx;
      ctx.editors.registerTitleAction({
        id: "title",
        label: "Title",
        run() {},
      });
      ctx.codeBlocks.register({
        language: "sample",
        render: () => ({ html: "ok" }),
      });
    },
  });
  await plugin.settled();
  plugin.setMarkers("panel", [
    { id: "one", from: 0, to: 3, documentVersion: 1, label: "One" },
  ]);
  await f.api.setPluginEnabled(plugin.id, false, {
    target: "workspaceFolder",
    resource: uri(f.panel.document.uri),
  });
  assert.equal(plugin.state.state, "active");
  assert.equal(
    f.api.getPlugins("panel").find((item) => item.id === plugin.id)?.state,
    "disabled",
  );
  assert.deepEqual(
    (await f.pair.client.call(markers, "current", {})).owners,
    {},
  );
  assert.deepEqual(await f.pair.client.call(actions, "current", {}), []);
  assert.deepEqual(
    (await f.pair.client.call(codeBlocks, "current", {})).languages,
    [],
  );
  assert.throws(() => retained.markers.set("panel", []), {
    code: "PluginDisabled",
  });
  await f.api.resetPluginOverride(plugin.id, {
    target: "workspaceFolder",
    resource: uri(f.panel.document.uri),
  });
  assert.equal((await f.pair.client.call(actions, "current", {})).length, 1);
  await f.dispose();
});

test("public marker API maps native edits and drops replaced source ranges", async () => {
  const f = await fixture();
  const plugin = f.api.plugin({
    ...definition,
    inject: { required: ["markers"] },
  });
  await plugin.settled();
  plugin.setMarkers("panel", [
    { id: "one", from: 5, to: 8, documentVersion: 1, label: "One" },
  ]);
  f.state.text = "X" + f.state.text;
  f.state.version++;
  f.root.emit("document/changed", f.panel.session, [
    { from: 0, to: 0, insert: "X" },
  ]);
  assert.equal(
    (await f.pair.client.call(markers, "current", {})).owners[plugin.id]?.[0]
      ?.from,
    5,
  );
  f.state.text = f.state.text.slice(0, 6) + f.state.text.slice(9);
  f.state.version++;
  f.root.emit("document/changed", f.panel.session, [
    { from: 6, to: 9, insert: "" },
  ]);
  assert.deepEqual(
    (await f.pair.client.call(markers, "current", {})).owners[plugin.id],
    [],
  );
  await f.dispose();
});
