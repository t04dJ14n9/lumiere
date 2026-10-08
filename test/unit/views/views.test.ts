import test from "node:test";
import assert from "node:assert/strict";
import { Context } from "../../../src/kernel";
import { backlinksHost } from "../../../src/plugins/backlinks/host";
import { BacklinksTree } from "../../../src/plugins/backlinks/tree";
import backlinks from "../../../src/plugins/backlinks/manifest";
import { outgoingLinksHost } from "../../../src/plugins/outgoingLinks/host";
import { OutgoingLinksTree } from "../../../src/plugins/outgoingLinks/tree";
import outgoingLinks from "../../../src/plugins/outgoingLinks/manifest";
import { workbenchFeatures } from "../../../src/host/workbench-features";
import {
  fakeViews,
  memoryVaults,
  render,
  uriOf,
  wait,
  workbenchWith,
} from "./fakes";

const notes = {
  "Target.md":
    "---\naliases: [Big Map]\n---\nTarget body [[Missing]] [[Other]] [[Other]]",
  "A.md": "Links [[Target]] twice: [[Target#Part]]",
  "folder/B.md": "One link ![[Target]]",
  "C.md": "Mentions target and the big map, no link.",
  "D.md": "Nothing here.",
  "Other.md": "",
};

test("backlinks list linking notes with context lines, and unlinked mentions on request", async () => {
  const { vaults } = memoryVaults(notes);
  const tree = new BacklinksTree(vaults);
  await tree.setNote(uriOf("Target.md"));
  assert.equal(tree.linkedCount(), 2);
  assert.deepEqual(await render(tree), [
    [
      "Linked mentions (2)",
      [
        [
          "A (2)",
          [
            "Links [[Target]] twice: [[Target#Part]]",
            "Links [[Target]] twice: [[Target#Part]]",
          ],
        ],
        ["B (folder  1)", ["One link ![[Target]]"]],
      ],
    ],
    [
      "Unlinked mentions",
      [
        [
          "C (2)",
          [
            "Mentions target and the big map, no link.",
            "Mentions target and the big map, no link.",
          ],
        ],
      ],
    ],
  ]);
});

test("a line opens its note at the mention", async () => {
  const { vaults } = memoryVaults(notes);
  const tree = new BacklinksTree(vaults);
  await tree.setNote(uriOf("Target.md"));
  const [linked] = await tree.roots();
  const [fileA] = await tree.children(linked!);
  const [first] = await tree.children(fileA!);
  assert.deepEqual(first!.command?.args, [
    uriOf("A.md"),
    notes["A.md"].indexOf("[[Target]]"),
  ]);
});

test("outgoing links list resolved files with counts, then links not created yet", async () => {
  const { vaults } = memoryVaults(notes);
  const tree = new OutgoingLinksTree(vaults);
  await tree.setNote(uriOf("Target.md"));
  assert.deepEqual(await render(tree), [
    ["Links (1)", ["Other (×2)"]],
    ["Not created yet (1)", ["Missing"]],
  ]);
  await tree.setNote(undefined);
  assert.deepEqual(await tree.roots(), []);
});

test("view plugins follow the active note and their setting, and clean up when turned off", async () => {
  const { vaults, opened } = memoryVaults(notes);
  const fake = fakeViews();
  const root = Context.create();
  root.provide("vaults", vaults);
  const workbench = workbenchWith(fake.views);
  let configure = () => {};
  workbench.onConfiguration = (listener) => {
    configure = listener;
    return () => {};
  };
  root.provide("workbench", workbench);
  workbenchFeatures(root, workbench, [
    { manifest: backlinks, plugin: backlinksHost },
    { manifest: outgoingLinks, plugin: outgoingLinksHost },
  ]);
  await root.settled();
  await wait();
  const status = fake.statuses.get("markdownWorkbench.backlinks")!;
  const view = fake.trees.get("markdownWorkbench.backlinks")!;
  assert.equal(view.message, "Open a note to see its backlinks.");
  assert.equal(status.text, undefined);

  fake.setActive(uriOf("Target.md"));
  await wait(400);
  assert.equal(view.message, undefined);
  assert.equal(status.text, "2 backlinks");

  await fake.commands.get("markdownWorkbench.backlinks.open")!(
    uriOf("A.md"),
    6,
  );
  assert.deepEqual(opened, [{ uri: uriOf("A.md"), offset: 6 }]);

  fake.settings["plugins.backlinks.enabled"] = false;
  configure();
  await wait();
  await root.settled();
  assert.equal(view.disposed, true);
  assert.equal(status.disposed, true);
  assert.equal(fake.commands.has("markdownWorkbench.backlinks.open"), false);
  assert.equal(
    fake.trees.get("markdownWorkbench.outgoingLinks")!.disposed,
    false,
  );

  fake.settings.preset = "minimal";
  configure();
  await wait();
  await root.settled();
  assert.equal(
    fake.trees.get("markdownWorkbench.outgoingLinks")!.disposed,
    true,
  );
  await root.dispose();
});
