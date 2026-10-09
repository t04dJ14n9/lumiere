import test from "node:test";
import assert from "node:assert/strict";
import { Context } from "../../../src/kernel";
import tagsManifest from "../../../src/plugins/tags/manifest";
import { SEARCH_COMMAND } from "../../../src/plugins/tags/tree";
import { tagsViewHost } from "../../../src/plugins/tags/view";
import { workbenchFeatures } from "../../../src/host/workbench-features";
import {
  fakeViews,
  memoryVaults,
  render,
  uriOf,
  wait,
  workbenchWith,
} from "../views/fakes";

async function start(
  notes: Record<string, string>,
  settings: Record<string, unknown> = {},
  excluded: string[] = [],
) {
  const fake = fakeViews(settings);
  const { vaults, index, opened } = memoryVaults(notes);
  for (const path of excluded) {
    index.upsertFile({ ...index.file(path)!, excluded: true });
  }
  const root = Context.create();
  root.provide("workbench", workbenchWith(fake.views));
  root.provide("vaults", vaults);
  root.plugin(tagsViewHost);
  await root.settled();
  await wait();
  return {
    root,
    fake,
    opened,
    view: fake.trees.get("markdownWorkbench.tags")!,
  };
}

test("the Tags view lists the vault's tags and a click picks a note to open", async () => {
  const { root, fake, opened, view } = await start({
    "A.md": "#project/alpha and #Ideas",
    "B.md": "---\ntags: [project]\n---\nbody",
  });
  assert.deepEqual(await render(view.source), [
    "Ideas (1)",
    ["project (2)", ["alpha (1)"]],
  ]);
  const [project] = (await view.source.roots()).slice(1);
  assert.deepEqual(project!.command, {
    id: SEARCH_COMMAND,
    args: ["memory:///vault", "project"],
  });

  const picks: string[][] = [];
  fake.views.pick = async (options) => {
    const items = options.items("");
    picks.push(items.map((item) => item.label));
    const item = items[0];
    return { ...(item && { item }), query: "" };
  };
  await fake.commands.get(SEARCH_COMMAND)!("memory:///vault", "project");
  assert.deepEqual(picks, [["A.md", "B.md"]]);
  assert.deepEqual(opened, [{ uri: uriOf("A.md") }]);
  await root.dispose();
  assert.equal(view.disposed, true);
});

test("counts are notes, case variants merge, and excluded files are left out", async () => {
  const notes = {
    "A.md": "#Project/one #project/two #project",
    "B.md": "#PROJECT/one",
    "C.md": "#other",
    "Hidden.md": "#project #secret",
  };
  const nested = await start(notes, {}, ["Hidden.md"]);
  assert.deepEqual(await render(nested.view.source), [
    "other (1)",
    ["Project (2)", ["one (2)", "two (1)"]],
  ]);
  await nested.root.dispose();

  const flat = await start(
    notes,
    { "tags.viewNested": false, "tags.viewSort": "frequency" },
    ["Hidden.md"],
  );
  assert.deepEqual(await render(flat.view.source), [
    "Project (2)",
    "Project/one (2)",
    "other (1)",
    "project/two (1)",
  ]);
  await flat.root.dispose();
});

test("an empty vault says so", async () => {
  const { root, view } = await start({ "A.md": "no tags" });
  assert.deepEqual(await render(view.source), []);
  assert.equal(view.message, "No tags in this vault yet.");
  await root.dispose();
});

test("the Tags view follows the tags plugin's enabled setting", async () => {
  const fake = fakeViews({ "plugins.tags.enabled": false });
  const { vaults } = memoryVaults({ "A.md": "#tag" });
  const root = Context.create();
  const workbench = workbenchWith(fake.views);
  const listeners = new Set<() => void>();
  workbench.onConfiguration = (listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const reconfigure = () => listeners.forEach((listener) => listener());
  root.provide("workbench", workbench);
  root.provide("vaults", vaults);
  workbenchFeatures(root, workbench, [
    { manifest: tagsManifest, plugin: tagsViewHost },
  ]);
  await wait();
  assert.equal(fake.trees.has("markdownWorkbench.tags"), false);
  fake.settings["plugins.tags.enabled"] = true;
  reconfigure();
  await wait();
  assert.equal(fake.trees.get("markdownWorkbench.tags")?.disposed, false);
  fake.settings["plugins.tags.enabled"] = false;
  reconfigure();
  await wait();
  assert.equal(fake.trees.get("markdownWorkbench.tags")?.disposed, true);
  await root.dispose();
});
