import test from "node:test";
import assert from "node:assert/strict";
import { Text } from "@codemirror/state";
import { buildWorktreeSnapshot } from "../../../src/shared/git-diff/snapshot";
import { unifiedRows } from "../../../src/shared/git-diff/unified";
import { computeHunks } from "../../../src/plugins/gitGutter/hunks";

const caps = {
  canStage: true,
  canUnstage: false,
  canRevert: true,
};

test("INDEX→WORKTREE sets liveAnchor on every hunk", () => {
  const snap = buildWorktreeSnapshot({
    repository: "file:///repo",
    fileUri: "file:///repo/a.md",
    baseText: "a\n",
    targetText: "a\nb\n",
    base: { kind: "INDEX", fingerprint: "i1" },
    target: { kind: "WORKTREE" },
    worktreeBytes: {
      origin: "document",
      uri: "file:///repo/a.md",
      version: 3,
      isDirty: true,
    },
    liveDocumentUri: "file:///repo/a.md",
    mapLiveAnchor: ({ modifiedFrom, modifiedTo }) => ({
      uri: "file:///repo/a.md",
      from: modifiedFrom,
      to: modifiedTo,
    }),
    capabilitiesFor: () => caps,
    computedAt: 1,
  });
  assert.ok(snap.hunks.length >= 1);
  assert.ok(snap.hunks.every((hunk) => hunk.liveAnchor));
  assert.equal(snap.sourceState.worktreeBytes?.origin, "document");
  const rows = unifiedRows(snap.hunks[0]!.lines);
  assert.ok(rows.some((row) => row.kind === "add" && row.text === "b"));
  assert.equal(
    rows.some((row) => row.text.includes("<")),
    false,
  );
});

test("live anchors use the same offsets as gutter hunks", () => {
  const base = "a\nold\nz\n";
  const now = "a\nnew\nz\nextra\n";
  const doc = Text.of(now.split("\n"));
  const snap = buildWorktreeSnapshot({
    repository: "file:///repo",
    fileUri: "file:///repo/a.md",
    baseText: base,
    targetText: now,
    base: { kind: "HEAD", oid: "abc" },
    target: { kind: "WORKTREE" },
    worktreeBytes: {
      origin: "document",
      uri: "file:///repo/a.md",
      version: 1,
      isDirty: true,
    },
    mapLiveAnchor: ({ modifiedFrom, modifiedTo }) => ({
      uri: "file:///repo/a.md",
      from: modifiedFrom,
      to: modifiedTo,
    }),
    capabilitiesFor: () => caps,
    computedAt: 1,
  });
  const docs = computeHunks(base, doc);
  assert.equal(snap.hunks.length, docs.length);
  for (let i = 0; i < docs.length; i++) {
    assert.equal(snap.hunks[i]!.liveAnchor?.from, docs[i]!.from);
  }
});

test("HEAD→INDEX omits liveAnchor by default", () => {
  const snap = buildWorktreeSnapshot({
    repository: "file:///repo",
    fileUri: "file:///repo/a.md",
    baseText: "a\n",
    targetText: "a\nb\n",
    base: { kind: "HEAD", oid: "abc" },
    target: { kind: "INDEX", fingerprint: "i1" },
    capabilitiesFor: () => ({
      canStage: false,
      canUnstage: true,
      canRevert: false,
    }),
    computedAt: 2,
  });
  assert.ok(snap.hunks.every((hunk) => hunk.liveAnchor === undefined));
  assert.equal(snap.liveDocumentUri, undefined);
  assert.equal(snap.sourceState.worktreeBytes, undefined);
});
