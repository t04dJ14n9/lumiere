import test from "node:test";
import assert from "node:assert/strict";
import { createMutationGate } from "../../../src/shared/git-diff/mutate";
import {
  revertControlEnabled,
  runGutterStage,
  stageControlEnabled,
} from "../../../src/plugins/gitGutter/mutations";
import type {
  ActionIntent,
  DiffHunk,
  DiffSnapshot,
  SourceState,
} from "../../../src/shared/git-diff";

const fileKey = "file:///repo/a.md";

function state(): SourceState {
  return {
    baseOidOrFingerprint: "idx",
    targetOidOrFingerprint: "doc:1",
    worktreeBytes: {
      origin: "document",
      uri: fileKey,
      version: 1,
      isDirty: true,
    },
  };
}

function snap(canStage = true): DiffSnapshot {
  const hunk: DiffHunk = {
    hunkId: "h1",
    generationId: "g1",
    originalRange: { startLine: 0, endLine: 0 },
    modifiedRange: { startLine: 0, endLine: 1 },
    lines: [{ kind: "add", modifiedLine: 1, text: "NEW LINE" }],
    capabilities: { canStage, canUnstage: false, canRevert: true },
  };
  return {
    generationId: "g1",
    repository: "file:///repo",
    fileUri: fileKey,
    base: { kind: "INDEX", fingerprint: "idx" },
    target: { kind: "WORKTREE" },
    sourceState: state(),
    hunks: [hunk],
    computedAt: 1,
  };
}

function intent(): ActionIntent {
  return {
    generationId: "g1",
    hunkId: "h1",
    sourceState: state(),
    action: "stage",
  };
}

test("missing hunk backend aborts and does not call whole-file stage", async () => {
  const gate = createMutationGate();
  let whole = 0;
  const result = await runGutterStage(gate, fileKey, intent(), {
    readSnapshot: async () => snap(),
    readAuthoritativeSourceState: async () => state(),
    wholeFileStage: async () => {
      whole += 1;
      return true;
    },
    backendWouldUseDiskBytes: true,
    canApplyExactBufferHunk: false,
  });
  assert.equal(result.status, "aborted");
  if (result.status === "aborted") {
    assert.match(result.reason, /hunk-scoped/);
  }
  assert.equal(whole, 0);
});

test("hunk stage execute receives the validated hunk and not whole-file stage", async () => {
  const gate = createMutationGate();
  let whole = 0;
  const seen: string[] = [];
  const clean: SourceState = {
    baseOidOrFingerprint: "head",
    targetOidOrFingerprint: "idx",
  };
  const indexed: DiffSnapshot = {
    ...snap(true),
    base: { kind: "HEAD", oid: "head" },
    target: { kind: "INDEX", fingerprint: "idx" },
    sourceState: clean,
  };
  const result = await runGutterStage(
    gate,
    fileKey,
    { ...intent(), sourceState: clean },
    {
      readSnapshot: async () => indexed,
      readAuthoritativeSourceState: async () => clean,
      wholeFileStage: async () => {
        whole += 1;
        return true;
      },
      backendWouldUseDiskBytes: false,
      canApplyExactBufferHunk: true,
      hunkStage: async (hunk) => {
        seen.push(hunk.hunkId);
        return true;
      },
    },
  );
  assert.equal(result.status, "ok");
  assert.deepEqual(seen, ["h1"]);
  assert.equal(whole, 0);
});

test("dirty document and missing worktreeBytes keep Stage and Revert disabled", () => {
  assert.equal(stageControlEnabled(snap(true), false), false);
  assert.equal(stageControlEnabled(snap(true), true), false);
  const missing: DiffSnapshot = {
    ...snap(),
    sourceState: {
      baseOidOrFingerprint: "idx",
      targetOidOrFingerprint: "wt",
    },
  };
  assert.equal(stageControlEnabled(missing, true), false);
  assert.equal(revertControlEnabled(missing), false);
  assert.equal(revertControlEnabled(snap()), true);
});
