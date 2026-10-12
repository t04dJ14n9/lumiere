import test from "node:test";
import assert from "node:assert/strict";
import { EditorState, Text } from "@codemirror/state";
import { Context } from "../../../src/kernel";
import { createRenderer } from "../../../src/markdown/html";
import { kindFor } from "../../../src/plugins/gitGutter/gutter";
import {
  computeHunks,
  hunkAt,
  hunkField,
  revertChange,
  setHunks,
} from "../../../src/plugins/gitGutter/hunks";
import { peekMarkdown } from "../../../src/plugins/gitGutter/peek";
import { gitGutterHost } from "../../../src/plugins/gitGutter/host";
import { protocol } from "../../../src/plugins/gitGutter/protocol";
import type { GitAccess } from "../../../src/shared/git";
import { rpcPair } from "../../support/rpc-pair";

const before =
  "# Title\n\nalpha beta\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\ngone\n\nend\n";
const after =
  "# Title\n\nalpha gamma\n\n| a | b |\n|---|---|\n| 1 | 3 |\n\nend\nnew\n";

test("computeHunks: offsets and baseline text for each kind", () => {
  const doc = Text.of(after.split("\n"));
  const hunks = computeHunks(before, doc);
  assert.deepEqual(
    hunks.map((h) => [h.kind, doc.lineAt(h.from).number, h.old, h.atEnd]),
    [
      ["modified", 3, "alpha beta", false],
      ["modified", 7, "| 1 | 2 |", false],
      ["deleted", 9, "gone\n", false],
      ["added", 10, "", false],
    ],
  );
});

test("revertChange puts every hunk back, alone or all together", () => {
  let seed = 3;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const words = ["a", "b", "c", "", "d"];
  for (let round = 0; round < 200; round++) {
    const make = () =>
      Array.from(
        { length: Math.floor(random() * 8) },
        () => words[Math.floor(random() * words.length)]!,
      ).join("\n");
    const base = make();
    const current = make();
    let state = EditorState.create({ doc: current });
    // Revert from the last hunk so earlier offsets stay valid.
    for (const hunk of computeHunks(base, state.doc).reverse()) {
      state = state.update({ changes: revertChange(state, hunk) }).state;
    }
    assert.equal(state.doc.toString(), base, JSON.stringify({ base, current }));
  }
});

test("hunks map through edits until the recompute lands", () => {
  let state = EditorState.create({ doc: after, extensions: [hunkField] });
  state = state.update({
    effects: setHunks.of(computeHunks(before, state.doc)),
  }).state;
  const first = state.field(hunkField);
  state = state.update({ changes: { from: 0, insert: "intro\n" } }).state;
  const mapped = state.field(hunkField);
  assert.equal(mapped.generation, first.generation);
  assert.equal(mapped.hunks[0]!.from, first.hunks[0]!.from + 6);
  assert.equal(
    state.sliceDoc(mapped.hunks[0]!.from, mapped.hunks[0]!.to),
    "alpha gamma",
  );
});

test("kindFor: one bar per block, changes outrank removals", () => {
  const doc = Text.of(after.split("\n"));
  const hunks = computeHunks(before, doc);
  const line = (n: number) => doc.line(n);
  assert.equal(
    kindFor(hunks, line(3).from, line(3).to, doc.length),
    "modified",
  );
  // A rendered table covering lines 5-7 shows a single modified bar.
  assert.equal(
    kindFor(hunks, line(5).from, line(7).to, doc.length),
    "modified",
  );
  assert.equal(kindFor(hunks, line(9).from, line(9).to, doc.length), "deleted");
  assert.equal(kindFor(hunks, line(10).from, line(10).to, doc.length), "added");
  assert.equal(kindFor(hunks, line(1).from, line(1).to, doc.length), undefined);
  // A removal after the last line marks the last line.
  const end = computeHunks("x\ny", Text.of(["x"]));
  assert.equal(kindFor(end, 0, 1, 1), "deleted-end");
  assert.equal(hunkAt(end, 0, 1)?.kind, "deleted");
});

test("peekMarkdown renders changed words tinted on each side", () => {
  const { before: old, after: now } = peekMarkdown(
    "Report it monthly.",
    "Report it per region.",
  );
  const render = createRenderer();
  const html = (md: string) =>
    render.renderMarkdown(md, { sanitize: (value) => value });
  assert.match(html(old), /<del class="mw-gd-del">monthly<\/del>/);
  assert.match(html(now), /<ins class="mw-gd-ins">per region<\/ins>/);
});

function fakeGit(
  text: string | undefined,
): GitAccess & { listeners: Set<() => void>; staged: string[] } {
  const listeners = new Set<() => void>();
  const staged: string[] = [];
  return {
    listeners,
    staged,
    async baseline() {
      return text === undefined
        ? { status: "unavailable" }
        : { status: "ok", baseline: { text, label: "HEAD (abc1234)" } };
    },
    onDidChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async stage(uri) {
      staged.push(uri);
      return true;
    },
    toGitUri: () => undefined,
  };
}

async function host(git: GitAccess | undefined) {
  const pair = rpcPair();
  const root = Context.create();
  let saved = 0;
  root.provide("workbench", { git } as never);
  root.provide("rpc", pair.host);
  const panel = {
    document: {
      uri: "file:///n.md",
      async save() {
        saved++;
        return true;
      },
    },
  };
  const fiber = root.plugin(gitGutterHost, { panel } as never);
  await root.settled();
  return { pair, root, fiber, saved: () => saved };
}

test("host: serves the baseline, stages after saving, and stops listening when off", async () => {
  const git = fakeGit("old\n");
  const h = await host(git);
  assert.deepEqual(
    await h.pair.client.call(protocol, "baseline", { ref: "HEAD" }),
    {
      status: "ok",
      text: "old\n",
      label: "HEAD (abc1234)",
    },
  );
  assert.equal(await h.pair.client.call(protocol, "stage", {}), true);
  assert.deepEqual(git.staged, ["file:///n.md"]);
  assert.equal(h.saved(), 1);
  assert.equal(git.listeners.size, 1);
  await h.fiber.dispose();
  assert.equal(git.listeners.size, 0);
  await h.root.dispose();
  await h.pair.dispose();
});

test("host: without git the note is unavailable, not an error", async () => {
  const h = await host(undefined);
  assert.deepEqual(
    await h.pair.client.call(protocol, "baseline", { ref: "index" }),
    { status: "unavailable" },
  );
  assert.equal(await h.pair.client.call(protocol, "stage", {}), false);
  await h.root.dispose();
  await h.pair.dispose();
});
