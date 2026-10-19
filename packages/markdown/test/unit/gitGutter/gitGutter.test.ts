import { provideHostServices } from "../../../src/shared/host";
import { fakeHost } from "../../support/vscode-fake";
import test from "node:test";
import assert from "node:assert/strict";
import { EditorState, Text } from "@codemirror/state";
import type { DocHunk } from "../../../src/plugins/gitGutter/api";
import {
  MAX_DIFF_CHARS,
  MAX_DIFF_LINES,
  exceedsDiffLimits,
} from "../../../src/shared/diff";
import { createRoot } from "@workshop/core";
import { createRenderer } from "../../../src/markdown/html";
import { barTooltip, kindFor } from "../../../src/plugins/gitGutter/gutter";
import {
  computeHunks,
  hunkAt,
  hunkField,
  resolveHunk,
  revertChange,
  setHunks,
} from "../../../src/plugins/gitGutter/hunks";
import {
  adoptPass,
  canPeek,
  endLifetime,
  peekContext,
  peekedHunk,
  peekMarkdown,
  peekState,
  peekTargetAt,
  setPeek,
} from "../../../src/plugins/gitGutter/peek";
import type { Lifetime } from "../../../src/plugins/gitGutter/peek";
import { markdownLanguage } from "@codemirror/lang-markdown";
import { markdown } from "@codemirror/lang-markdown";
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
    async blameLine() {
      return { status: "unavailable", repoGeneration: 0 };
    },
    async identity() {
      return undefined;
    },
    repoGeneration() {
      return 0;
    },
  };
}

async function host(
  git: GitAccess | undefined,
  save: () => Promise<boolean> = async () => true,
) {
  const pair = rpcPair();
  const root = createRoot();
  let saved = 0;
  const errors: string[] = [];
  provideHostServices(
    root,
    fakeHost({
      ...(git ? { git } : {}),
      dialogs: { error: (message) => void errors.push(message) },
    }),
  );
  root.provide("rpc", pair.host);
  const panel = {
    document: {
      uri: "file:///n.md",
      async save() {
        saved++;
        return save();
      },
    },
  };
  const fiber = root.plugin(gitGutterHost, { panel } as never);
  await root.settled();
  return { pair, root, fiber, errors, saved: () => saved };
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

/** Revert as the model does it: resolve the held hunk against a fresh diff. */
function revertHeld(state: EditorState, baseline: string, held: DocHunk) {
  const target = resolveHunk(computeHunks(baseline, state.doc), held);
  return target
    ? state.update({ changes: revertChange(state, target) }).state
    : state;
}

test("B1: a hunk held from before an earlier edit still reverts its own lines", () => {
  const baseline = "a\n\nold\n";
  let state = EditorState.create({ doc: "b\n\nnew\n", extensions: hunkField });
  state = state.update({
    effects: setHunks.of(computeHunks(baseline, state.doc)),
  }).state;
  const held = state.field(hunkField).hunks[1]!;
  assert.deepEqual([held.from, held.to], [3, 6]);
  // b → bb: the second hunk moves to [4, 7); same line, text, index and count.
  state = state.update({ changes: { from: 0, insert: "b" } }).state;
  assert.equal(revertHeld(state, baseline, held).doc.toString(), "bb\n\nold\n");
  // After the recompute too.
  state = state.update({
    effects: setHunks.of(computeHunks(baseline, state.doc)),
  }).state;
  assert.equal(revertHeld(state, baseline, held).doc.toString(), "bb\n\nold\n");
});

test("B2: reverting a change that has disappeared leaves the text alone", () => {
  const baseline = "a\nz";
  let state = EditorState.create({ doc: "a\nnew\nz", extensions: hunkField });
  state = state.update({
    effects: setHunks.of(computeHunks(baseline, state.doc)),
  }).state;
  // Delete "new\n" before the recompute: the mapped hunk is still "added", empty.
  state = state.update({ changes: { from: 2, to: 6 } }).state;
  const mapped = state.field(hunkField).hunks[0]!;
  assert.deepEqual([mapped.kind, mapped.from, mapped.to], ["added", 2, 2]);
  assert.equal(revertHeld(state, baseline, mapped).doc.toString(), "a\nz");
  // A line join next to a removal anchor: only the real change is reverted.
  const joined = EditorState.create({ doc: "a\nb c\n" });
  const hunks = computeHunks("a\nb\nc\n", joined.doc);
  const after = revertHeld(joined, "a\nb\nc\n", hunks[0]!);
  assert.equal(after.doc.toString(), "a\nb\nc\n");
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

test("B3: a render pass resolving after the peek is gone is disposed exactly once", async () => {
  let disposed = 0;
  const pass = { dispose: async () => void disposed++ } as never;
  // Late: the peek closed (or the plugin went off) while it rendered.
  const late: Lifetime = { live: true, passes: [] };
  const pending = deferred<never>();
  const adopted = adoptPass(late, pending.promise);
  endLifetime(late);
  pending.resolve(pass);
  assert.equal(await adopted, false);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(disposed, 1);
  assert.equal(late.passes.length, 0);
  // In time: kept, then disposed once when the peek goes, not again after.
  const live: Lifetime = { live: true, passes: [] };
  assert.equal(await adoptPass(live, Promise.resolve(pass)), true);
  endLifetime(live);
  endLifetime(live);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(disposed, 2);
});

test("B4: a failed or rejected save stages nothing; a staging failure is reported", async () => {
  for (const save of [
    async () => false,
    async () => {
      throw new Error("disk full");
    },
  ]) {
    const git = fakeGit("old\n");
    const h = await host(git, save);
    assert.equal(await h.pair.client.call(protocol, "stage", {}), false);
    assert.deepEqual(git.staged, []);
    assert.match(h.errors[0]!, /could not be saved/);
    await h.root.dispose();
    await h.pair.dispose();
  }
  const git = fakeGit("old\n");
  git.stage = async () => {
    throw new Error("index.lock exists");
  };
  const h = await host(git);
  assert.equal(await h.pair.client.call(protocol, "stage", {}), false);
  assert.match(h.errors[0]!, /Staging failed: index.lock exists/);
  await h.root.dispose();
  await h.pair.dispose();
});

test("B5: a baseline past the limits is refused before it reaches the editor", async () => {
  const lines = fakeGit("x\n".repeat(MAX_DIFF_LINES + 1));
  const chars = fakeGit("x".repeat(MAX_DIFF_CHARS + 1));
  for (const git of [lines, chars]) {
    const h = await host(git);
    assert.deepEqual(
      await h.pair.client.call(protocol, "baseline", { ref: "HEAD" }),
      { status: "tooLarge" },
    );
    await h.root.dispose();
    await h.pair.dispose();
  }
  assert.equal(exceedsDiffLimits("x\n".repeat(MAX_DIFF_LINES - 1)), false);
  assert.equal(exceedsDiffLimits("x\n".repeat(MAX_DIFF_LINES)), true);
});

test("N1: the peek shows the whole table, fence or frontmatter the change sits in", () => {
  const state = (doc: string) =>
    EditorState.create({
      doc,
      extensions: markdown({ base: markdownLanguage }),
    });
  const cases: [string, string, RegExp][] = [
    [
      "| a |\n| --- |\n| 1 |\n",
      "| a |\n| --- |\n| 2 |\n",
      /^\| a \|\n\| --- \|\n\| 1 \|$/,
    ],
    [
      "```js\nconst x = 1;\n```\n",
      "```js\nconst x = 2;\n```\n",
      /^```js\nconst x = 1;\n```$/,
    ],
    [
      "---\nstatus: draft\n---\n# T\n",
      "---\nstatus: done\n---\n# T\n",
      /^---\nstatus: draft\n---$/,
    ],
  ];
  for (const [baseline, now, old] of cases) {
    const s = state(now);
    const [hunk] = computeHunks(baseline, s.doc);
    const context = peekContext(s, hunk!);
    assert.match(context.old, old);
    assert.equal(context.now, now.slice(0, context.now.length));
    // Revert stays narrow: only the changed line.
    assert.equal(
      s.update({ changes: revertChange(s, hunk!) }).state.doc.toString(),
      baseline,
    );
  }
});

test("R2-B1: a held addition never retargets a different, larger fresh hunk", () => {
  const baseline = "A";
  let state = EditorState.create({ doc: "X\nA\nY", extensions: hunkField });
  state = state.update({
    effects: setHunks.of(computeHunks(baseline, state.doc)),
  }).state;
  const y = state.field(hunkField).hunks[1]!;
  assert.deepEqual([y.kind, y.from, y.to, y.oldLine], ["added", 4, 5, 2]);
  // Append "\nA" before the recompute: the fresh diff is one [0,5) addition.
  state = state.update({ changes: { from: 5, insert: "\nA" } }).state;
  const mapped = state.field(hunkField).hunks[1]!;
  const after = revertHeld(state, baseline, mapped).doc.toString();
  assert.ok(after.startsWith("X\n"), `X was deleted: ${JSON.stringify(after)}`);
  assert.ok(["X\nA\nY\nA", "X\nA"].includes(after), after);
});

test("barTooltip names each gutter color", () => {
  assert.equal(barTooltip("added"), "added");
  assert.equal(barTooltip("modified"), "modified");
  assert.equal(barTooltip("deleted"), "deleted");
  assert.equal(barTooltip("deleted-end"), "deleted");
});

test("canPeek allows added hunks", () => {
  const doc = Text.of(after.split("\n"));
  const hunks = computeHunks(before, doc);
  assert.equal(canPeek(hunks.find((h) => h.kind === "added")!), true);
  assert.equal(canPeek(hunks.find((h) => h.kind === "modified")!), true);
  assert.equal(canPeek(hunks.find((h) => h.kind === "deleted")!), true);
});

test("peekedHunk opens an added hunk", () => {
  const doc = Text.of(after.split("\n"));
  const hunks = computeHunks(before, doc);
  const added = hunks.find((h) => h.kind === "added")!;
  const modified = hunks.find((h) => h.kind === "modified")!;
  let state = EditorState.create({
    doc,
    extensions: [hunkField, peekState],
  });
  state = state.update({
    effects: [setHunks.of(hunks), setPeek.of(added.from)],
  }).state;
  assert.equal(peekedHunk(state)?.kind, "added");
  state = state.update({ effects: setPeek.of(modified.from) }).state;
  assert.equal(peekedHunk(state)?.kind, "modified");
});

test("peekTargetAt prefers a modified hunk when an added hunk overlaps the same block", () => {
  const hunks: DocHunk[] = [
    { kind: "added", from: 10, to: 20, old: "", oldLine: 2, atEnd: false },
    {
      kind: "modified",
      from: 15,
      to: 40,
      old: "old row",
      oldLine: 3,
      atEnd: false,
    },
  ];
  // hunkAt returns the earlier added row; the bar would show modified.
  assert.equal(hunkAt(hunks, 10, 40)?.kind, "added");
  assert.equal(peekTargetAt(hunks, 10, 40)?.kind, "modified");
  assert.equal(peekTargetAt(hunks, 10, 14)?.kind, "added");
});
