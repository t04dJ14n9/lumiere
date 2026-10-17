import test from "node:test";
import assert from "node:assert/strict";
import { createRoot } from "@workshop/core";
import { linkUpdatesHost } from "../../../src/plugins/linkUpdates/host";
import { fakeViews, memoryVaults, uriOf, workbenchWith } from "../views/fakes";

const notes = {
  "Topic/Old.md": "",
  "A.md": "See [[Old|the old note]] and [[Old#Part]].",
  "B.md": "Embed ![[Old]]",
  "C.md": "Unrelated [[A]]",
};

async function start(settings: Record<string, unknown> = {}) {
  const { vaults } = memoryVaults(notes);
  const fake = fakeViews(settings);
  const root = createRoot();
  root.provide("vaults", vaults);
  root.provide("workshop", workbenchWith(fake.views));
  root.plugin(linkUpdatesHost);
  await root.settled();
  return { root, fake };
}

const rename = [
  { oldUri: uriOf("Topic/Old.md"), newUri: uriOf("Topic/New.md") },
];

test("a rename asks once and returns one edit list for every linking note", async () => {
  const { root, fake } = await start();
  fake.answerWith("Update Links");
  const edits = await fake.rename(rename);
  assert.deepEqual(fake.prompts, ["Update links in 2 files?"]);
  assert.deepEqual(
    edits.map((file) => [file.uri, file.edits.map((edit) => edit.text)]),
    [
      [uriOf("A.md"), ["[[New|the old note]]", "[[New#Part]]"]],
      [uriOf("B.md"), ["![[New]]"]],
    ],
  );
  await root.dispose();
});

test("declining, or the never mode, changes nothing; always does not ask", async () => {
  const declined = await start();
  declined.fake.answerWith("Don't Update");
  assert.deepEqual(await declined.fake.rename(rename), []);
  await declined.root.dispose();

  const never = await start({ "linkUpdates.mode": "never" });
  assert.deepEqual(await never.fake.rename(rename), []);
  assert.deepEqual(never.fake.prompts, []);
  await never.root.dispose();

  const always = await start({ "linkUpdates.mode": "always" });
  assert.equal((await always.fake.rename(rename)).length, 2);
  assert.deepEqual(always.fake.prompts, []);
  await always.root.dispose();
});

test("renaming a folder updates links to every file in it", async () => {
  const { root, fake } = await start({
    "linkUpdates.mode": "always",
    "links.newLinkFormat": "absolute",
  });
  const edits = await fake.rename([
    { oldUri: uriOf("Topic"), newUri: uriOf("Subject") },
  ]);
  assert.deepEqual(
    edits.flatMap((file) => file.edits.map((edit) => edit.text)),
    [
      "[[Subject/Old|the old note]]",
      "[[Subject/Old#Part]]",
      "![[Subject/Old]]",
    ],
  );
  await root.dispose();
});

test("edits are computed from the open document, not a stale vault copy", async () => {
  const { root, fake } = await start({ "linkUpdates.mode": "always" });
  const open = '---\nrelated: "[[Old]]"\n---\nNew line [[Old|the old note]].';
  fake.views.documentText = (uri) => (uri === uriOf("A.md") ? open : undefined);
  const edits = await fake.rename(rename);
  const a = edits.find((file) => file.uri === uriOf("A.md"));
  assert.deepEqual(
    a?.edits
      .map((edit) => [edit.start.line, edit.start.col, edit.text])
      .sort((x, y) => Number(x[0]) - Number(y[0])),
    [
      [1, 10, "[[New]]"],
      [3, 9, "[[New|the old note]]"],
    ],
  );
  await root.dispose();
});
