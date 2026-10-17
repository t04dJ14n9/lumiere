import test from "node:test";
import assert from "node:assert/strict";
import * as hostPlugins from "../../../src/plugins/host";
import * as webviewPlugins from "../../../src/plugins/webview";
import { PluginGraph } from "../../../src/plugins/plugin-graph";
import type { PluginDeclaration } from "../../../src/plugins/plugin-graph";

const definitions = [
  ...Object.values(hostPlugins),
  ...Object.values(webviewPlugins),
] as PluginDeclaration[];

test("the built-in plugins form an acyclic graph in which every injected service has a provider", () => {
  const graph = new PluginGraph(definitions);
  const order = graph.activationOrder();
  for (const node of graph.nodes.values()) {
    for (const dependency of [...node.requires, ...node.optional]) {
      assert.ok(
        order.indexOf(dependency) < order.indexOf(node.id),
        `${node.id} after ${dependency}`,
      );
    }
  }
});

test("dependencies come from injected services: tables needs the editor and optionally uses Vim and Links", () => {
  const graph = new PluginGraph(definitions);
  const tables = graph.nodes.get("tables")!;
  assert.ok(tables.requires.has("editor"));
  assert.ok(tables.requires.has("livePreview"));
  assert.deepEqual([...tables.optional].sort(), ["formatting", "links", "vim"]);
  assert.ok(!graph.dependentsOf("links").includes("tables"));
  // Turning Vim off stops nothing; turning Live Preview off stops its renderers.
  assert.deepEqual(graph.dependentsOf("vim"), []);
  assert.ok(graph.dependentsOf("livePreview").includes("math"));
  assert.ok(graph.dependentsOf("livePreview").includes("tables"));
});

test("cycles, missing providers and shared services are reported", () => {
  assert.throws(
    () =>
      new PluginGraph([
        {
          name: "vim",
          inject: { required: ["formatting"] },
          provides: ["vim"],
        },
        {
          name: "formatting",
          inject: { required: ["vim"] },
          provides: ["formatting"],
        },
      ]),
    /cycle: (vim -> formatting -> vim|formatting -> vim -> formatting)/,
  );
  assert.throws(
    () => new PluginGraph([{ name: "tables", inject: { required: ["vim"] } }]),
    /tables injects vim, which no plugin provides/,
  );
  assert.throws(
    () =>
      new PluginGraph([
        { name: "vim", provides: ["vim"] },
        { name: "emacs", provides: ["vim"] },
      ]),
    /vim is provided by both vim and emacs/,
  );
});
