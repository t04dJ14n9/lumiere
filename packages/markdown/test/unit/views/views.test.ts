import { provideHostServices } from "../../../src/shared/host";
import test from "node:test";
import assert from "node:assert/strict";
import { createRoot } from "@workshop/core";
import { backlinksHost } from "../../../src/plugins/backlinks/host";
import {
  BacklinksTree,
  OPEN_COMMAND,
  VIEW_ID as backlinksViewId,
} from "../../../src/plugins/backlinks/tree";
import backlinks from "../../../src/plugins/backlinks/manifest";
import { outgoingLinksHost } from "../../../src/plugins/outgoingLinks/host";
import {
  OutgoingLinksTree,
  VIEW_ID as outgoingLinksViewId,
} from "../../../src/plugins/outgoingLinks/tree";
import outgoingLinks from "../../../src/plugins/outgoingLinks/manifest";
import { workbenchFeatures } from "../../../src/host/workshop-features";
import {
  fakeViews,
  memoryVaults,
  render,
  uriOf,
  wait,
  hostWith,
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

test("outgoing links list resolved files, unresolved, and unlinked mentions", async () => {
  const { vaults } = memoryVaults(notes);
  const tree = new OutgoingLinksTree(vaults);
  await tree.setNote(uriOf("Target.md"));
  assert.deepEqual(await render(tree), [
    ["Links (1)", ["Other (×2)"]],
    ["Not created yet (1)", ["Missing"]],
    ["Unlinked mentions", []],
  ]);
  await tree.setNote(uriOf("C.md"));
  assert.deepEqual(await render(tree), [
    ["Links (0)", []],
    ["Not created yet (0)", []],
    [
      "Unlinked mentions",
      [
        [
          "Target (2)",
          [
            "Mentions target and the big map, no link.",
            "Mentions target and the big map, no link.",
          ],
        ],
      ],
    ],
  ]);
  await tree.setNote(undefined);
  assert.deepEqual(await tree.roots(), []);
});

test("an outgoing unlinked context line opens the active note at the mention", async () => {
  const { vaults } = memoryVaults(notes);
  const tree = new OutgoingLinksTree(vaults);
  await tree.setNote(uriOf("C.md"));
  const roots = await tree.roots();
  const unlinked = roots.find((node) => node.id === "unlinked")!;
  const [file] = await tree.children(unlinked);
  const [line] = await tree.children(file!);
  assert.equal(file!.label, "Target");
  assert.deepEqual(line!.command?.args, [
    uriOf("C.md"),
    notes["C.md"].toLowerCase().indexOf("target"),
  ]);
});

test("outgoing unlinked mentions skip notes already linked from here", async () => {
  const { vaults } = memoryVaults({
    ...notes,
    "E.md": "Plain Target word and also [[Target]].",
  });
  const tree = new OutgoingLinksTree(vaults);
  await tree.setNote(uriOf("E.md"));
  const unlinked = (await tree.roots()).find((node) => node.id === "unlinked")!;
  const files = await tree.children(unlinked);
  assert.deepEqual(
    files.map((node) => node.label),
    [],
    "Target is already a resolved outbound link",
  );
});

test("Backlinks and Outgoing Links are off until turned on", async () => {
  const { vaults } = memoryVaults(notes);
  const fake = fakeViews();
  const root = createRoot();
  root.provide("vaults", vaults);
  const host = hostWith(fake);
  provideHostServices(root, host);
  workbenchFeatures(root, host.settings, [
    { manifest: backlinks, plugin: backlinksHost },
    { manifest: outgoingLinks, plugin: outgoingLinksHost },
  ]);
  await root.settled();
  await wait();
  assert.equal(fake.trees.has(backlinksViewId), false);
  assert.equal(fake.trees.has(outgoingLinksViewId), false);
  assert.equal(fake.statuses.has("lumiere.markdown.backlinks"), false);
  await root.dispose();
});

test("view plugins follow the active note and their setting, and clean up when turned off", async () => {
  const { vaults, opened } = memoryVaults(notes);
  const fake = fakeViews({
    "plugins.backlinks.enabled": true,
    "plugins.outgoingLinks.enabled": true,
  });
  const root = createRoot();
  root.provide("vaults", vaults);
  const host = hostWith(fake);
  let configure = () => {};
  host.settings.onChange = (listener) => {
    configure = listener;
    return () => {};
  };
  provideHostServices(root, host);
  workbenchFeatures(root, host.settings, [
    { manifest: backlinks, plugin: backlinksHost },
    { manifest: outgoingLinks, plugin: outgoingLinksHost },
  ]);
  await root.settled();
  await wait();
  const status = fake.statuses.get("lumiere.markdown.backlinks")!;
  const view = fake.trees.get(backlinksViewId)!;
  assert.equal(view.message, "Open a note to see its backlinks.");
  assert.equal(status.text, undefined);

  fake.setActive(uriOf("Target.md"));
  await wait(400);
  assert.equal(view.message, undefined);
  assert.equal(status.text, "2 backlinks");

  await fake.commands.get(OPEN_COMMAND)!(uriOf("A.md"), 6);
  assert.deepEqual(opened, [{ uri: uriOf("A.md"), offset: 6 }]);

  fake.settings["plugins.backlinks.enabled"] = false;
  configure();
  await wait();
  await root.settled();
  assert.equal(view.disposed, true);
  assert.equal(status.disposed, true);
  assert.equal(fake.commands.has(OPEN_COMMAND), false);
  assert.equal(fake.trees.get(outgoingLinksViewId)!.disposed, false);

  fake.settings.preset = "minimal";
  configure();
  await wait();
  await root.settled();
  assert.equal(fake.trees.get(outgoingLinksViewId)!.disposed, true);
  await root.dispose();
});
