import test from "node:test";
import assert from "node:assert/strict";
import { createMutationGate } from "../../../src/shared/git-diff/mutate";
import { resolveNearestHunk } from "../../../src/shared/git-diff/resolve";
import type {
  ActionIntent,
  DiffHunk,
  DiffSnapshot,
  SourceState,
} from "../../../src/shared/git-diff";

const fileKey = "file:///repo/a.md";

function baseState(over: Partial<SourceState> = {}): SourceState {
  return {
    baseOidOrFingerprint: "idx",
    targetOidOrFingerprint: "doc:1",
    worktreeBytes: {
      origin: "document",
      uri: fileKey,
      version: 1,
      isDirty: true,
    },
    ...over,
  };
}

function makeSnap(sourceState: SourceState, hunkId = "h1"): DiffSnapshot {
  const hunk: DiffHunk = {
    hunkId,
    generationId: "g1",
    originalRange: { startLine: 0, endLine: 0 },
    modifiedRange: { startLine: 0, endLine: 1 },
    lines: [{ kind: "add", modifiedLine: 1, text: "NEW LINE" }],
    capabilities: { canStage: true, canUnstage: false, canRevert: true },
    liveAnchor: { uri: fileKey, from: 0, to: 0 },
  };
  return {
    generationId: "g1",
    repository: "file:///repo",
    fileUri: fileKey,
    base: { kind: "INDEX", fingerprint: "idx" },
    target: { kind: "WORKTREE" },
    sourceState,
    liveDocumentUri: fileKey,
    hunks: [hunk],
    computedAt: 1,
  };
}

test("dirty document vs disk backend → Stage abort", async () => {
  const gate = createMutationGate();
  const intent: ActionIntent = {
    generationId: "g1",
    hunkId: "h1",
    sourceState: baseState(),
    action: "stage",
  };
  const snap = makeSnap(baseState());
  const result = await gate.run(fileKey, intent, {
    readSnapshot: async () => snap,
    readAuthoritativeSourceState: async () => baseState(),
    backendWouldUseDiskBytes: true,
    canApplyExactBufferHunk: false,
    execute: async () => {
      throw new Error("must not execute");
    },
  });
  assert.equal(result.status, "aborted");
  if (result.status === "aborted") {
    assert.match(result.reason, /worktreeBytes|disk|buffer/i);
  }
});

test("stale index fingerprint aborts", async () => {
  const gate = createMutationGate();
  const intent: ActionIntent = {
    generationId: "g1",
    hunkId: "h1",
    sourceState: baseState(),
    action: "stage",
  };
  const result = await gate.run(fileKey, intent, {
    readSnapshot: async () => makeSnap(baseState()),
    readAuthoritativeSourceState: async () =>
      baseState({ baseOidOrFingerprint: "idx-STALE" }),
    backendWouldUseDiskBytes: false,
    canApplyExactBufferHunk: true,
    execute: async () => ({ ok: true }),
  });
  assert.equal(result.status, "aborted");
});

test("disappeared hunk aborts — no nearest retarget", async () => {
  const gate = createMutationGate();
  const intent: ActionIntent = {
    generationId: "g1",
    hunkId: "gone",
    sourceState: baseState(),
    action: "revert",
  };
  const result = await gate.run(fileKey, intent, {
    readSnapshot: async () => makeSnap(baseState(), "other"),
    readAuthoritativeSourceState: async () => baseState(),
    backendWouldUseDiskBytes: false,
    canApplyExactBufferHunk: true,
    execute: async () => ({ ok: true }),
  });
  assert.equal(result.status, "aborted");
});

test("overlapping Stage is single-flight", async () => {
  const gate = createMutationGate();
  const intent: ActionIntent = {
    generationId: "g1",
    hunkId: "h1",
    sourceState: baseState(),
    action: "stage",
  };
  let started = 0;
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const deps = {
    readSnapshot: async () => makeSnap(baseState()),
    readAuthoritativeSourceState: async () => baseState(),
    backendWouldUseDiskBytes: false,
    canApplyExactBufferHunk: true,
    execute: async () => {
      started += 1;
      await hold;
      return { ok: true };
    },
  };
  const first = gate.run(fileKey, intent, deps);
  const second = await gate.run(fileKey, intent, deps);
  assert.equal(second.status, "busy");
  release();
  const done = await first;
  assert.equal(done.status, "ok");
  assert.equal(started, 1);
});

test("WORKTREE snapshot missing worktreeBytes → Stage/Revert abort (R4 fail-closed)", async () => {
  const gate = createMutationGate();
  const missingWt: SourceState = {
    baseOidOrFingerprint: "idx",
    targetOidOrFingerprint: "wt-unknown",
  };
  const intent: ActionIntent = {
    generationId: "g1",
    hunkId: "h1",
    sourceState: missingWt,
    action: "stage",
  };
  const snap = makeSnap(missingWt);
  const result = await gate.run(fileKey, intent, {
    readSnapshot: async () => snap,
    readAuthoritativeSourceState: async () => missingWt,
    backendWouldUseDiskBytes: true,
    canApplyExactBufferHunk: false,
    execute: async () => {
      throw new Error("must not execute");
    },
  });
  assert.equal(result.status, "aborted");
  if (result.status === "aborted") {
    assert.match(result.reason, /worktreeBytes/i);
  }
  const revert = await gate.run(
    fileKey,
    { ...intent, action: "revert" },
    {
      readSnapshot: async () => snap,
      readAuthoritativeSourceState: async () => missingWt,
      backendWouldUseDiskBytes: false,
      canApplyExactBufferHunk: true,
      execute: async () => {
        throw new Error("must not execute");
      },
    },
  );
  assert.equal(revert.status, "aborted");
});

test("disk-backed WORKTREE fingerprint mismatch aborts", async () => {
  const gate = createMutationGate();
  const diskState: SourceState = {
    baseOidOrFingerprint: "idx",
    targetOidOrFingerprint: "disk:f1",
    worktreeBytes: { origin: "disk", path: "/repo/a.md", fingerprint: "f1" },
  };
  const intent: ActionIntent = {
    generationId: "g1",
    hunkId: "h1",
    sourceState: diskState,
    action: "stage",
  };
  const result = await gate.run(fileKey, intent, {
    readSnapshot: async () => makeSnap(diskState),
    readAuthoritativeSourceState: async () => ({
      ...diskState,
      worktreeBytes: { origin: "disk", path: "/repo/a.md", fingerprint: "f2" },
    }),
    backendWouldUseDiskBytes: true,
    canApplyExactBufferHunk: false,
    execute: async () => ({ ok: true }),
  });
  assert.equal(result.status, "aborted");
});

test("nearest UI rematch does not retarget Stage", async () => {
  const gate = createMutationGate();
  const old = makeSnap(baseState(), "h1").hunks[0]!;
  const refreshed = makeSnap(baseState(), "near");
  const rematched = resolveNearestHunk(
    {
      ...refreshed,
      generationId: "g2",
      hunks: refreshed.hunks.map((hunk) => ({ ...hunk, generationId: "g2" })),
    },
    old,
  );
  assert.equal(rematched?.hunkId, "near");
  let executed = 0;
  const result = await gate.run(
    fileKey,
    {
      generationId: old.generationId,
      hunkId: old.hunkId,
      sourceState: baseState(),
      action: "stage",
    },
    {
      readSnapshot: async () => ({
        ...refreshed,
        generationId: "g2",
        hunks: refreshed.hunks.map((hunk) => ({ ...hunk, generationId: "g2" })),
      }),
      readAuthoritativeSourceState: async () => baseState(),
      backendWouldUseDiskBytes: false,
      canApplyExactBufferHunk: true,
      execute: async () => {
        executed += 1;
        return { ok: true };
      },
    },
  );
  assert.equal(result.status, "aborted");
  if (result.status === "aborted") {
    assert.match(result.reason, /generation|disappeared/i);
  }
  assert.equal(executed, 0);
});
