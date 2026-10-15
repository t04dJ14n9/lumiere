import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { computeHunks } from "../../../src/plugins/gitGutter/hunks";
import { liveRevertReaders } from "../../../src/plugins/gitGutter/revert-run";
import { runGutterRevert } from "../../../src/plugins/gitGutter/mutations";
import { DiffSession } from "../../../src/plugins/gitGutter/session";
import { peekAt, peekRef } from "../../../src/plugins/gitGutter/peek";
import type { DocHunk } from "../../../src/plugins/gitGutter/api";

test("a mapped bar still resolves the same snapshot hunk", () => {
  const session = new DiffSession("HEAD");
  const snapshot = session.publish("live-document", "a\n\nold\n", "b\n\nnew\n");
  const second = snapshot.hunks[1];
  assert.ok(second?.liveAnchor);
  const mapped: DocHunk = {
    kind: "modified",
    from: second.liveAnchor.from + 1,
    to: second.liveAnchor.to + 1,
    old: "old",
    oldLine: second.originalRange.startLine + 1,
    atEnd: false,
  };
  assert.equal(session.refFor(mapped)?.hunkId, second.hunkId);
  assert.ok(session.linesFor(mapped).some((line) => line.text === "old"));
});

test("nearest display rematch does not let Revert mutate the neighbor", async () => {
  const session = new DiffSession("HEAD");
  const baseline = "keep\n\ngone\n";
  const first = session.publish("file", baseline, "KEEP\n\nGONE\n");
  const gone = first.hunks[0];
  assert.ok(gone?.liveAnchor);
  const open = {
    at: gone.liveAnchor.from,
    ref: { generationId: first.generationId, hunkId: gone.hunkId },
  };
  const next = session.publish("file", baseline, "keep\n\nGONE\n");
  const neighbor = next.hunks[0];
  assert.ok(neighbor);
  assert.notEqual(neighbor.hunkId, gone.hunkId);
  const doc = EditorState.create({ doc: "keep\n\nGONE\n" }).doc;
  const rematched = session.rematch(first, open, computeHunks(baseline, doc));
  assert.ok(rematched);
  assert.equal(peekAt(rematched), neighbor.liveAnchor?.from);
  assert.equal(peekRef(rematched)?.hunkId, gone.hunkId);
  assert.equal(session.mutationAllowed(rematched), false);
  let executed = 0;
  const ref = peekRef(rematched);
  assert.ok(ref);
  const result = await runGutterRevert(
    session.gate,
    "file",
    {
      generationId: ref.generationId,
      hunkId: ref.hunkId,
      sourceState: next.sourceState,
      action: "revert",
    },
    {
      ...liveRevertReaders(session),
      applyRevert: async () => {
        executed += 1;
        return true;
      },
    },
  );
  assert.equal(result.status, "aborted");
  assert.equal(executed, 0);
});

test("an edit that only changes context keeps Revert on that baseline hunk", () => {
  const session = new DiffSession("HEAD");
  const baseline = "a\n\nold\n";
  const first = session.publish("file", baseline, "b\n\nnew\n");
  const target = first.hunks[1];
  assert.ok(target?.liveAnchor);
  const open = {
    at: target.liveAnchor.from,
    ref: { generationId: first.generationId, hunkId: target.hunkId },
  };
  const next = session.publish("file", baseline, "bb\n\nnew\n");
  const still = next.hunks[1];
  assert.ok(still?.liveAnchor);
  assert.notEqual(still.hunkId, target.hunkId);
  const doc = EditorState.create({ doc: "bb\n\nnew\n" }).doc;
  const rematched = session.rematch(first, open, computeHunks(baseline, doc));
  assert.ok(rematched);
  assert.equal(peekAt(rematched), still.liveAnchor.from);
  assert.equal(peekRef(rematched)?.hunkId, still.hunkId);
  assert.equal(peekRef(rematched)?.generationId, next.generationId);
  assert.equal(session.mutationAllowed(rematched), true);
});

test("a shifted bar with different baseline text does not match", () => {
  const session = new DiffSession("HEAD");
  session.publish("live-document", "a\n\nold\n", "b\n\nnew\n");
  const other: DocHunk = {
    kind: "modified",
    from: 99,
    to: 102,
    old: "elsewhere",
    oldLine: 3,
    atEnd: false,
  };
  assert.equal(session.refFor(other), undefined);
});
