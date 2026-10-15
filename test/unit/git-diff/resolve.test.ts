import test from "node:test";
import assert from "node:assert/strict";
import {
  hunkFingerprint,
  resolveExactHunk,
  resolveNearestHunk,
  sourceStateEquals,
} from "../../../src/shared/git-diff/resolve";
import { sha256Hex } from "../../../src/shared/git-diff/sha256";
import type {
  DiffHunk,
  DiffSnapshot,
  SourceState,
} from "../../../src/shared/git-diff";

function hunk(
  partial: Partial<DiffHunk> & Pick<DiffHunk, "hunkId" | "generationId">,
): DiffHunk {
  return {
    originalRange: { startLine: 0, endLine: 1 },
    modifiedRange: { startLine: 0, endLine: 1 },
    lines: [{ kind: "add", modifiedLine: 1, text: "x" }],
    capabilities: { canStage: true, canUnstage: false, canRevert: true },
    ...partial,
  };
}

function snap(hunks: DiffHunk[], sourceState?: SourceState): DiffSnapshot {
  return {
    generationId: hunks[0]?.generationId ?? "g",
    repository: "file:///repo",
    fileUri: "file:///repo/a.md",
    base: { kind: "INDEX", fingerprint: "i" },
    target: { kind: "WORKTREE" },
    sourceState: sourceState ?? {
      baseOidOrFingerprint: "i",
      targetOidOrFingerprint: "wt",
      worktreeBytes: {
        origin: "document",
        uri: "file:///repo/a.md",
        version: 1,
        isDirty: true,
      },
    },
    liveDocumentUri: "file:///repo/a.md",
    hunks,
    computedAt: 1,
  };
}

test("sha256 matches the empty-string and abc test vectors", () => {
  assert.equal(
    sha256Hex(""),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
  assert.equal(
    sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

test("resolveExactHunk matches fingerprint+generation only", () => {
  const a = hunk({ hunkId: "h1", generationId: "g1" });
  const s = snap([a]);
  assert.equal(
    resolveExactHunk(s, { generationId: "g1", hunkId: "h1" })?.hunkId,
    "h1",
  );
  assert.equal(
    resolveExactHunk(s, { generationId: "g2", hunkId: "h1" }),
    undefined,
  );
});

test("resolveNearestHunk picks surviving neighbor; exact still fails after rematch identity change", () => {
  const old = hunk({
    hunkId: "old",
    generationId: "g0",
    modifiedRange: { startLine: 10, endLine: 12 },
  });
  const near = hunk({
    hunkId: "near",
    generationId: "g1",
    modifiedRange: { startLine: 11, endLine: 13 },
  });
  const s = snap([near]);
  assert.equal(resolveNearestHunk(s, old)?.hunkId, "near");
  assert.equal(
    resolveExactHunk(s, { generationId: "g0", hunkId: "old" }),
    undefined,
  );
});

test("sourceStateEquals requires worktreeBytes origin match", () => {
  const doc: SourceState = {
    baseOidOrFingerprint: "i",
    targetOidOrFingerprint: "wt",
    worktreeBytes: { origin: "document", uri: "u", version: 2, isDirty: true },
  };
  const disk: SourceState = {
    baseOidOrFingerprint: "i",
    targetOidOrFingerprint: "wt",
    worktreeBytes: { origin: "disk", path: "/a.md", fingerprint: "f" },
  };
  assert.equal(sourceStateEquals(doc, doc), true);
  assert.equal(sourceStateEquals(doc, disk), false);
});

test("hunkFingerprint is stable for same comparison content", () => {
  const lines = [{ kind: "add" as const, modifiedLine: 1, text: "hello" }];
  const a = hunkFingerprint({
    originalRange: { startLine: 0, endLine: 0 },
    modifiedRange: { startLine: 0, endLine: 1 },
    lines,
    baseKey: "INDEX:i",
    targetKey: "WORKTREE",
  });
  const b = hunkFingerprint({
    originalRange: { startLine: 0, endLine: 0 },
    modifiedRange: { startLine: 0, endLine: 1 },
    lines,
    baseKey: "INDEX:i",
    targetKey: "WORKTREE",
  });
  assert.equal(a, b);
  assert.notEqual(
    a,
    hunkFingerprint({
      originalRange: { startLine: 0, endLine: 0 },
      modifiedRange: { startLine: 0, endLine: 1 },
      lines: [{ kind: "add", modifiedLine: 1, text: "other" }],
      baseKey: "INDEX:i",
      targetKey: "WORKTREE",
    }),
  );
});
