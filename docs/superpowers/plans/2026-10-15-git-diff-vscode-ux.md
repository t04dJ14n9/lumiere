# Git Diff VS Code UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Share one semantic DiffSnapshot/DiffHunk model across `gitGutter`, `gitInline`, and `gitDiffEditor`, open a raw unified peek (including pure adds), and make Stage/Unstage/Revert fail closed on exact hunk + `sourceState`/`worktreeBytes` with per-file single-flight.

**Architecture:** Build the shared snapshot/hunk + mutation gate first and unit-test every dangerous transition before any chrome. Then wire `gitGutter` to a raw unified peek via `openHunk`, leave Stage/Revert disabled until the gate is green, then enable mutations, then add a thin `gitInline` adapter (B5 precedence), then align `gitDiffEditor` chrome/navigation last.

**Tech Stack:** TypeScript VS Code extension, CodeMirror 6 Live Preview, existing `src/shared/diff` + `src/shared/git` + `vscode.git` host adapter, node:test under `test/unit`.

**Spec:** `docs/superpowers/specs/2026-10-15-git-diff-vscode-ux-design.md` @ `76a21bc` (APPROVED; ChatGPT R4 @ `/workspace/plans/chatgpt-git-diff-ux-r4/ANSWER.md`)

## Global Constraints

- Keep our viewer; **no** Monaco / VS Code DiffEditor source port.
- Shared language = data model, navigation vocabulary, actions, visual tokens — **not** identical full-file rendering.
- Comparison-side `originalRange`/`modifiedRange` always present; `liveAnchor`/`liveDocumentUri` optional (WORKTREE-backed only).
- Mutations: **exact** fingerprint + matching `sourceState` (incl. `worktreeBytes`) or **ABORT**. Passive UI may nearest-rematch. Never nearest-retarget Stage/Unstage/Revert.
- Dirty buffer vs disk: Stage/Revert **disabled/aborted** unless backend can mutate those exact in-memory bytes.
- Per-file single-flight mutation pending — not a general SCM transaction layer.
- Ship behind existing plugin toggles; do **not** force-enable `gitInline`.
- Preserve `diffEditor` setting `native` | `rendered`; do not remove `native`.
- Prefer restyle + shared API over new editor architecture.

---

## File map

| Area | Touch |
|---|---|
| Shared model | **Create** `src/shared/git-diff/types.ts`, `snapshot.ts`, `resolve.ts`, `mutate.ts`, `fingerprint.ts`, `index.ts` |
| Shared tests | **Create** `test/unit/git-diff/*.test.ts` (dangerous transitions first) |
| Gutter bridge | Modify `src/plugins/gitGutter/api.ts`, `hunks.ts`, `peek.ts`, `gutter.ts`, `webview.ts`, `host.ts`, `protocol.ts`; CSS `gitGutter.css` / shared peek styles |
| Inline adapter | Modify `src/plugins/gitInline/decorations.ts`, `webview.ts` |
| Diff editor | Modify `src/plugins/gitDiffEditor/host.ts` (+ webview/resources as needed for header/nav vocabulary) |
| Host git | Extend `src/shared/git.ts` / `src/host/git.ts` only if fingerprint / OID hooks are missing (prefer thin adapters over inventing full-repo hashing) |
| Existing tests | Update `test/unit/gitGutter`, `gitInline`, `gitDiffEditor`; browser/vscode specs that assume adds cannot peek |

---

### Task 1: Shared types — DiffSnapshot, DiffHunk, sourceState, HunkRef

**Files:**
- Create: `src/shared/git-diff/types.ts`
- Create: `src/shared/git-diff/index.ts` (re-exports)
- Test: `test/unit/git-diff/types.test.ts` (compile-time shape via construction asserts)

**Interfaces:**
- Produces: `DiffSide`, `WorktreeBytes`, `SourceState`, `DiffSnapshot`, `DiffHunk`, `HunkRef`, `HunkCapabilities`, `ActionIntent`, `LineRecord`

- [ ] **Step 1: Write the type module**

```ts
// src/shared/git-diff/types.ts
export type DiffSide =
  | { readonly kind: "HEAD"; readonly oid: string }
  | { readonly kind: "INDEX"; readonly fingerprint: string }
  | { readonly kind: "WORKTREE" }
  | { readonly kind: "revision"; readonly ref: string; readonly oid: string }
  | { readonly kind: "empty" };

export type WorktreeBytes =
  | {
      readonly origin: "document";
      readonly uri: string;
      readonly version: number;
      readonly isDirty: boolean;
    }
  | {
      readonly origin: "disk";
      readonly path: string;
      readonly fingerprint: string;
    };

export interface SourceState {
  readonly baseOidOrFingerprint: string;
  readonly targetOidOrFingerprint: string;
  /** Required when base or target is WORKTREE (incl. empty→untracked). */
  readonly worktreeBytes?: WorktreeBytes;
}

export interface LineRange {
  /** 0-based start line on that comparison side; may equal end for zero-length. */
  readonly startLine: number;
  readonly endLine: number;
}

export interface LiveAnchor {
  readonly uri: string;
  /** Document offset (CodeMirror) or equivalent; zero-width for deletes. */
  readonly from: number;
  readonly to: number;
  /** Optional: which modified-side line the user clicked (1-based comparison). */
  readonly clickedModifiedLine?: number;
}

export interface LineRecord {
  readonly kind: "context" | "add" | "delete";
  readonly originalLine?: number;
  readonly modifiedLine?: number;
  readonly text: string;
}

export interface HunkCapabilities {
  readonly canStage: boolean;
  readonly canUnstage: boolean;
  readonly canRevert: boolean;
}

export interface DiffHunk {
  readonly hunkId: string;
  readonly generationId: string;
  readonly originalRange: LineRange;
  readonly modifiedRange: LineRange;
  readonly liveAnchor?: LiveAnchor;
  readonly lines: readonly LineRecord[];
  readonly capabilities: HunkCapabilities;
}

export interface DiffSnapshot {
  readonly generationId: string;
  /** Repository root URI / path — file identity lives with the registry key that owns this snapshot. */
  readonly repository: string;
  /** Worktree / compared file URI (always set, even when liveDocumentUri is absent). */
  readonly fileUri: string;
  readonly base: DiffSide;
  readonly target: DiffSide;
  readonly sourceState: SourceState;
  readonly liveDocumentUri?: string;
  readonly hunks: readonly DiffHunk[];
  readonly computedAt: number;
}

export interface HunkRef {
  readonly generationId: string;
  readonly hunkId: string;
}

export interface ActionIntent {
  readonly generationId: string;
  readonly hunkId: string;
  readonly sourceState: SourceState;
  readonly action: "stage" | "unstage" | "revert";
}
```

- [ ] **Step 2: Re-export from index**

```ts
// src/shared/git-diff/index.ts
export type * from "./types";
```

- [ ] **Step 3: Smoke construction test**

```ts
// test/unit/git-diff/types.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import type { DiffSnapshot } from "../../../src/shared/git-diff";

test("DiffSnapshot requires fileUri even without liveDocumentUri", () => {
  const snap: DiffSnapshot = {
    generationId: "g1",
    repository: "file:///repo",
    fileUri: "file:///repo/note.md",
    base: { kind: "HEAD", oid: "abc" },
    target: { kind: "INDEX", fingerprint: "idx1" },
    sourceState: {
      baseOidOrFingerprint: "abc",
      targetOidOrFingerprint: "idx1",
    },
    hunks: [],
    computedAt: 0,
  };
  assert.equal(snap.liveDocumentUri, undefined);
  assert.equal(snap.fileUri.endsWith("note.md"), true);
});
```

- [ ] **Step 4: Run test**

```bash
pnpm exec tsx --test test/unit/git-diff/types.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/git-diff test/unit/git-diff/types.test.ts
git commit -m "feat(git-diff): shared DiffSnapshot/DiffHunk types with sourceState"
```

---

### Task 2: Fingerprint, exact vs nearest resolve helpers

**Files:**
- Create: `src/shared/git-diff/fingerprint.ts`
- Create: `src/shared/git-diff/resolve.ts`
- Test: `test/unit/git-diff/resolve.test.ts`
- Modify: `src/shared/git-diff/index.ts`

**Interfaces:**
- Consumes: types from Task 1
- Produces: `hunkFingerprint(...)`, `resolveExactHunk(snapshot, ref)`, `resolveNearestHunk(snapshot, previous)`, `sourceStateEquals(a, b)`

- [ ] **Step 1: Write failing resolve tests**

```ts
// test/unit/git-diff/resolve.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  hunkFingerprint,
  resolveExactHunk,
  resolveNearestHunk,
  sourceStateEquals,
} from "../../../src/shared/git-diff/resolve";
import type { DiffHunk, DiffSnapshot, SourceState } from "../../../src/shared/git-diff";

function hunk(partial: Partial<DiffHunk> & Pick<DiffHunk, "hunkId" | "generationId">): DiffHunk {
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

test("resolveExactHunk matches fingerprint+generation only", () => {
  const a = hunk({ hunkId: "h1", generationId: "g1" });
  const s = snap([a]);
  assert.equal(resolveExactHunk(s, { generationId: "g1", hunkId: "h1" })?.hunkId, "h1");
  assert.equal(resolveExactHunk(s, { generationId: "g2", hunkId: "h1" }), undefined);
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
  assert.equal(resolveExactHunk(s, { generationId: "g0", hunkId: "old" }), undefined);
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
});
```

- [ ] **Step 2: Run — expect FAIL (module missing)**

```bash
pnpm exec tsx --test test/unit/git-diff/resolve.test.ts
```

Expected: FAIL cannot find module / exports.

- [ ] **Step 3: Implement fingerprint + resolve**

```ts
// src/shared/git-diff/fingerprint.ts
import { createHash } from "node:crypto";
import type { LineRange, LineRecord } from "./types";

export function hunkFingerprint(input: {
  originalRange: LineRange;
  modifiedRange: LineRange;
  lines: readonly LineRecord[];
  baseKey: string;
  targetKey: string;
}): string {
  const h = createHash("sha256");
  h.update(input.baseKey);
  h.update("\0");
  h.update(input.targetKey);
  h.update("\0");
  h.update(`${input.originalRange.startLine}:${input.originalRange.endLine}`);
  h.update("\0");
  h.update(`${input.modifiedRange.startLine}:${input.modifiedRange.endLine}`);
  h.update("\0");
  for (const line of input.lines) {
    h.update(line.kind);
    h.update("\0");
    h.update(String(line.originalLine ?? ""));
    h.update("\0");
    h.update(String(line.modifiedLine ?? ""));
    h.update("\0");
    h.update(line.text);
    h.update("\n");
  }
  return h.digest("hex").slice(0, 32);
}

export function sideKey(side: {
  kind: string;
  oid?: string;
  fingerprint?: string;
  ref?: string;
}): string {
  if (side.kind === "HEAD") return `HEAD:${side.oid ?? ""}`;
  if (side.kind === "INDEX") return `INDEX:${side.fingerprint ?? ""}`;
  if (side.kind === "revision") return `revision:${side.ref ?? ""}:${side.oid ?? ""}`;
  if (side.kind === "empty") return "empty";
  return "WORKTREE";
}
```

```ts
// src/shared/git-diff/resolve.ts
import type { DiffHunk, DiffSnapshot, HunkRef, SourceState, WorktreeBytes } from "./types";
export { hunkFingerprint, sideKey } from "./fingerprint";

export function sourceStateEquals(a: SourceState, b: SourceState): boolean {
  if (
    a.baseOidOrFingerprint !== b.baseOidOrFingerprint ||
    a.targetOidOrFingerprint !== b.targetOidOrFingerprint
  ) {
    return false;
  }
  return worktreeBytesEquals(a.worktreeBytes, b.worktreeBytes);
}

function worktreeBytesEquals(a?: WorktreeBytes, b?: WorktreeBytes): boolean {
  if (a === undefined && b === undefined) return true;
  if (!a || !b || a.origin !== b.origin) return false;
  if (a.origin === "document" && b.origin === "document") {
    return a.uri === b.uri && a.version === b.version && a.isDirty === b.isDirty;
  }
  if (a.origin === "disk" && b.origin === "disk") {
    return a.path === b.path && a.fingerprint === b.fingerprint;
  }
  return false;
}

export function resolveExactHunk(
  snapshot: DiffSnapshot,
  ref: HunkRef,
): DiffHunk | undefined {
  if (snapshot.generationId !== ref.generationId) return undefined;
  return snapshot.hunks.find((h) => h.hunkId === ref.hunkId);
}

/** UI continuity only — never use for Stage/Unstage/Revert. */
export function resolveNearestHunk(
  snapshot: DiffSnapshot,
  previous: DiffHunk,
): DiffHunk | undefined {
  if (snapshot.hunks.length === 0) return undefined;
  const exact = snapshot.hunks.find((h) => h.hunkId === previous.hunkId);
  if (exact) return exact;
  const targetMid =
    (previous.modifiedRange.startLine + previous.modifiedRange.endLine) / 2;
  let best: DiffHunk | undefined;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const h of snapshot.hunks) {
    const mid = (h.modifiedRange.startLine + h.modifiedRange.endLine) / 2;
    const dist = Math.abs(mid - targetMid);
    if (dist < bestDist) {
      best = h;
      bestDist = dist;
    }
  }
  return best;
}
```

Update `index.ts` to export resolve helpers.

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec tsx --test test/unit/git-diff/resolve.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/shared/git-diff test/unit/git-diff/resolve.test.ts
git commit -m "feat(git-diff): exact vs nearest hunk resolve and fingerprints"
```

---

### Task 3: Mutation dispatcher — sourceState validation + per-file single-flight

**Files:**
- Create: `src/shared/git-diff/mutate.ts`
- Test: `test/unit/git-diff/mutate.test.ts`

**Interfaces:**
- Consumes: `ActionIntent`, `DiffSnapshot`, resolve helpers
- Produces: `MutationGate`, `createMutationGate(fileKey)`, `validateWorktreeOperand(...)`, `runMutation(...)`
- ChatGPT note: keep `sourceState` validation **centralized** here; Stage/Revert handlers must not bypass it.

- [ ] **Step 1: Write failing dangerous-transition tests**

```ts
// test/unit/git-diff/mutate.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { createMutationGate } from "../../../src/shared/git-diff/mutate";
import type { ActionIntent, DiffHunk, DiffSnapshot, SourceState } from "../../../src/shared/git-diff";

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
    backendWouldUseDiskBytes: true, // peek from buffer; backend stages disk
    canApplyExactBufferHunk: false,
    execute: async () => {
      throw new Error("must not execute");
    },
  });
  assert.equal(result.status, "aborted");
  assert.match(result.reason ?? "", /worktreeBytes|disk|buffer/i);
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
  const hold = new Promise<void>((r) => {
    release = r;
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
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm exec tsx --test test/unit/git-diff/mutate.test.ts
```

- [ ] **Step 3: Implement gate**

```ts
// src/shared/git-diff/mutate.ts
import { resolveExactHunk, sourceStateEquals } from "./resolve";
import type { ActionIntent, DiffSnapshot, SourceState } from "./types";

export type MutationResult =
  | { readonly status: "ok" }
  | { readonly status: "aborted"; readonly reason: string }
  | { readonly status: "busy" }
  | { readonly status: "error"; readonly error: unknown };

export interface MutationDeps {
  readSnapshot: () => Promise<DiffSnapshot>;
  readAuthoritativeSourceState: () => Promise<SourceState>;
  /** True when Git stage/revert would read the on-disk file, not the buffer. */
  backendWouldUseDiskBytes: boolean;
  /** True when backend can apply the exact in-memory hunk / buffer content. */
  canApplyExactBufferHunk: boolean;
  execute: () => Promise<{ ok: boolean }>;
}

export function mutationsAllowedForWorktree(
  intentState: SourceState,
  authState: SourceState,
  deps: Pick<MutationDeps, "backendWouldUseDiskBytes" | "canApplyExactBufferHunk">,
): { ok: true } | { ok: false; reason: string } {
  if (!sourceStateEquals(intentState, authState)) {
    return { ok: false, reason: "sourceState mismatch" };
  }
  const wt = intentState.worktreeBytes;
  if (!wt) return { ok: true };
  if (wt.origin === "document" && deps.backendWouldUseDiskBytes && !deps.canApplyExactBufferHunk) {
    return {
      ok: false,
      reason: "worktreeBytes document vs disk backend mismatch",
    };
  }
  return { ok: true };
}

export function createMutationGate() {
  const pending = new Set<string>();
  return {
    isPending(fileKey: string): boolean {
      return pending.has(fileKey);
    },
    async run(
      fileKey: string,
      intent: ActionIntent,
      deps: MutationDeps,
    ): Promise<MutationResult> {
      if (pending.has(fileKey)) return { status: "busy" };
      pending.add(fileKey);
      try {
        const auth = await deps.readAuthoritativeSourceState();
        const allowed = mutationsAllowedForWorktree(intent.sourceState, auth, deps);
        if (!allowed.ok) return { status: "aborted", reason: allowed.reason };
        const snapshot = await deps.readSnapshot();
        if (snapshot.generationId !== intent.generationId) {
          return { status: "aborted", reason: "generation mismatch" };
        }
        if (!sourceStateEquals(snapshot.sourceState, intent.sourceState)) {
          return { status: "aborted", reason: "snapshot sourceState drift" };
        }
        const hunk = resolveExactHunk(snapshot, {
          generationId: intent.generationId,
          hunkId: intent.hunkId,
        });
        if (!hunk) return { status: "aborted", reason: "hunk disappeared" };
        // Capability check — never infer from colors.
        if (intent.action === "stage" && !hunk.capabilities.canStage) {
          return { status: "aborted", reason: "cannot stage" };
        }
        if (intent.action === "unstage" && !hunk.capabilities.canUnstage) {
          return { status: "aborted", reason: "cannot unstage" };
        }
        if (intent.action === "revert" && !hunk.capabilities.canRevert) {
          return { status: "aborted", reason: "cannot revert" };
        }
        const executed = await deps.execute();
        return executed.ok ? { status: "ok" } : { status: "aborted", reason: "execute failed" };
      } catch (error) {
        return { status: "error", error };
      } finally {
        pending.delete(fileKey);
      }
    },
  };
}

export type MutationGate = ReturnType<typeof createMutationGate>;
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec tsx --test test/unit/git-diff/mutate.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/shared/git-diff/mutate.ts test/unit/git-diff/mutate.test.ts src/shared/git-diff/index.ts
git commit -m "feat(git-diff): per-file mutation gate with worktreeBytes checks"
```

---

### Task 4: Snapshot builder from baseline + document (bridge existing DocHunk)

**Files:**
- Create: `src/shared/git-diff/snapshot.ts`
- Test: `test/unit/git-diff/snapshot.test.ts`
- Modify: `src/shared/git.ts` / `src/host/git.ts` only if needed for INDEX fingerprint or HEAD oid (use existing `GitBaseline.label` / repo `HEAD.commit` when available)

**Interfaces:**
- Consumes: `computeHunks`-style line diffs via `src/shared/diff` `lineHunks`; types + fingerprint
- Produces: `buildWorktreeSnapshot(input) → DiffSnapshot` with `liveAnchor` for INDEX→WORKTREE / HEAD→WORKTREE; without live mapping for HEAD→INDEX

- [ ] **Step 1: Write snapshot tests (incl. HEAD→INDEX has no liveAnchor)**

```ts
// test/unit/git-diff/snapshot.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { buildWorktreeSnapshot } from "../../../src/shared/git-diff/snapshot";

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
    // document offsets: line 2 "b" → compute inside builder or pass mapper
    mapLiveAnchor: ({ modifiedFrom, modifiedTo }) => ({
      uri: "file:///repo/a.md",
      from: modifiedFrom,
      to: modifiedTo,
    }),
    capabilitiesFor: () => ({ canStage: true, canUnstage: false, canRevert: true }),
  });
  assert.ok(snap.hunks.length >= 1);
  assert.ok(snap.hunks.every((h) => h.liveAnchor));
  assert.equal(snap.sourceState.worktreeBytes?.origin, "document");
});

test("HEAD→INDEX omits liveAnchor by default", () => {
  const snap = buildWorktreeSnapshot({
    repository: "file:///repo",
    fileUri: "file:///repo/a.md",
    baseText: "a\n",
    targetText: "a\nb\n",
    base: { kind: "HEAD", oid: "abc" },
    target: { kind: "INDEX", fingerprint: "i1" },
    // no worktreeBytes required when neither side is WORKTREE
    capabilitiesFor: () => ({ canStage: false, canUnstage: true, canRevert: false }),
  });
  assert.ok(snap.hunks.every((h) => h.liveAnchor === undefined));
  assert.equal(snap.liveDocumentUri, undefined);
});
```

- [ ] **Step 2: Implement `buildWorktreeSnapshot`** using `lineHunks` from `src/shared/diff`, assign `hunkId` via `hunkFingerprint`, set `generationId` with `crypto.randomUUID()` (or monotonic counter injected for tests).

- [ ] **Step 3: Run tests PASS; commit**

```bash
pnpm exec tsx --test test/unit/git-diff/snapshot.test.ts
git add src/shared/git-diff test/unit/git-diff/snapshot.test.ts
git commit -m "feat(git-diff): build DiffSnapshot from baseline/target texts"
```

---

### Task 5: gitGutter → raw unified peek (Stage/Revert still disabled)

**Files:**
- Modify: `src/plugins/gitGutter/peek.ts` — remove `canPeek` exclusion of `added`; render **raw unified** two line-number columns (B6), not rendered Markdown mini-diff
- Modify: `src/plugins/gitGutter/gutter.ts`, `webview.ts` — click → `openHunk(ref)`; pure adds open peek
- Modify: `src/plugins/gitGutter/api.ts` / `hunks.ts` — expose current `DiffSnapshot` (or map DocHunk → DiffHunk via Task 4); keep DocHunk as presentation bridge if needed short-term
- Modify: CSS (`gitGutter.css` / shared) — use VS Code-ish tokens: `diffEditor.insertedLineBackground`, `diffEditor.removedLineBackground`, `peekView.*`, gutter added/modified/deleted
- Test: update `test/unit/gitGutter/gitGutter.test.ts`; add cases for added-line peek + caret/`liveAnchor`

**Interfaces:**
- Consumes: `DiffSnapshot`, `openHunk`, `resolveNearestHunk` for passive refresh
- Produces: peek header with base→target label, derived `N of M`, prev/next/close, **Open Full Diff** (carries snapshot sides); Stage/Revert **buttons disabled** (or hidden) until Task 6

- [ ] **Step 1: Failing test — added hunks open peek**

```ts
test("canPeek allows added hunks", () => {
  const added = {
    kind: "added" as const,
    from: 0,
    to: 1,
    old: "",
    oldLine: 1,
    atEnd: false,
  };
  assert.equal(canPeek(added), true);
});
```

- [ ] **Step 2: Change `canPeek` to always true (or delete and gate only on presence)**

```ts
export function canPeek(_hunk: DocHunk): boolean {
  return true;
}
```

- [ ] **Step 3: Replace peek body with raw unified renderer**

Render rows from `DiffHunk.lines`:

```text
old new
 12  12   context
 13       deleted text
     13   added text
```

Use comparison-side line numbers from `originalLine`/`modifiedLine`. Do **not** call `peekMarkdown` / rendered blocks for the peek body. Keep Live Preview rendered outside the peek.

- [ ] **Step 4: Wire open path**

On gutter click / “Show Git Change”: resolve hunk from current snapshot → `openHunk({ generationId, hunkId })`. If `liveAnchor` present, move Live Preview caret to clicked line; **focus stays in Live Preview**.

- [ ] **Step 5: Passive refresh**

On document/git change: recompute snapshot; if open ref exact-matches keep it; else `resolveNearestHunk`; if none → close peek. Do **not** call mutation gate here.

- [ ] **Step 6: Run unit + existing gitGutter tests**

```bash
pnpm exec tsx --test test/unit/gitGutter/gitGutter.test.ts test/unit/git-diff/*.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add src/plugins/gitGutter src/shared/git-diff test/unit/gitGutter test/unit/git-diff
git commit -m "feat(gitGutter): raw unified peek via shared openHunk (mutations disabled)"
```

---

### Task 6: Enable Stage / Revert through mutation gate

**Files:**
- Modify: `src/plugins/gitGutter/webview.ts`, `host.ts`, `protocol.ts`
- Modify: peek header actions to call `createMutationGate().run(...)`
- Test: extend `test/unit/git-diff/mutate.test.ts` + gutter tests for “nearest UI rematch does not retarget Stage”

**Interfaces:**
- Today's host `saveAndStage` (save then `git.stage` whole file) is **whole-file** and disk-backed after save — for dirty divergent buffers, **keep Stage disabled** until a path can stage the exact buffer hunk OR the document is saved **and** `worktreeBytes` revalidated as disk with matching fingerprint after save.
- Hunk-level Revert already edits the buffer via `revertChange` — route through gate with `backendWouldUseDiskBytes: false`, `canApplyExactBufferHunk: true`.
- Unstage: only when comparison is HEAD→INDEX and capabilities allow (may be follow-up if host lacks unstage API — disable rather than fake).

- [ ] **Step 1: Centralize action entry**

```ts
async function onStage(intent: ActionIntent) {
  const result = await mutationGate.run(fileKey, intent, depsForStage);
  if (result.status !== "ok") {
    refreshSnapshot(); // passive rematch
    report(result.status === "aborted" ? result.reason : "stage failed");
  }
}
```

Handlers must **not** call `git.stage` / revert except via `deps.execute` inside the gate.

- [ ] **Step 2: Disable Stage when `worktreeBytes.origin === 'document' && isDirty` and execute would save+stage disk** unless you first save, rebuild snapshot from disk bytes, and only then stage with matching disk `worktreeBytes`.

- [ ] **Step 3: Regression — nearest rematch then Stage aborts**

Simulate: open hunk A; refresh replaces with nearest B (new generation); fire Stage with **old** intent → `aborted` / `hunk disappeared` / generation mismatch. Must not stage B.

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(gitGutter): Stage/Revert via shared mutation gate"
```

---

### Task 7: gitInline thin adapter (B5 precedence)

**Files:**
- Modify: `src/plugins/gitInline/decorations.ts`, `webview.ts`
- Test: `test/unit/gitInline/gitInline.test.ts` (+ browser if present)

**Interfaces:**
- Consumes: same `openHunk` as gutter; requires `liveAnchor`
- Produces: collapsed click opens hunk **without** stealing links/checkboxes/selection drag

- [ ] **Step 1: Precedence tests**

```ts
test("inline open suppressed while selection drag", () => {
  // selection non-empty → openHunk not called
});
test("link/checkbox click does not open hunk", () => {
  // interactive target → default action only
});
```

- [ ] **Step 2: On collapsed ordinary click** — set caret + `openHunk(ref)`. Do not `preventDefault` caret placement unnecessarily. If ambiguous, use margin glyph / “Show Diff” control rather than whole highlight hit-target.

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(gitInline): thin openHunk adapter with B5 click precedence"
```

---

### Task 8: gitDiffEditor chrome / navigation alignment

**Files:**
- Modify: `src/plugins/gitDiffEditor/host.ts` (+ panel webview if header lives there)
- Test: `test/unit/gitDiffEditor/gitDiffEditor.test.ts`

**Interfaces:**
- Consumes: same hunk model / nav vocabulary; **no** `liveAnchor` required
- Preserve `native` escape hatch
- Align title (base→target), prev/next hunk vocabulary, action enablement with peek where practical — do **not** rewrite full-file rendered architecture

- [ ] **Step 1: Map comparison URIs into structured `DiffSide` + `sourceState` when opening from SCM/Timeline**
- [ ] **Step 2: Open Full Diff from peek passes this snapshot’s base→target (not rediscovery)**
- [ ] **Step 3: Commit**

```bash
git commit -am "feat(gitDiffEditor): shared hunk vocabulary and snapshot-sided Open Full Diff"
```

---

### Task 9: Acceptance suite + theme tokens

**Files:**
- Tests across unit/browser as available
- CSS token mapping finalize

- [ ] **Step 1: Minimum acceptance (from spec)**

| Case | Expect |
|---|---|
| Gutter click on **added** line | raw unified peek opens |
| Modified/deleted | peek still works |
| WORKTREE caret | moves to `liveAnchor` / clicked line; focus stays Live Preview |
| HEAD→INDEX | comparison ranges present; no pretend Live Preview target |
| Stale / mismatched `sourceState` | mutation abort |
| Nearest UI rematch | does **not** retarget Stage/Revert |
| Overlapping Stage | single-flight (`busy`) |
| Dirty TextDocument + disk divergence | Stage disabled/aborted |
| Inline click | does not steal link/checkbox/selection |

- [ ] **Step 2: Run**

```bash
pnpm exec tsx --test test/unit/git-diff/*.test.ts test/unit/gitGutter/*.test.ts test/unit/gitInline/*.test.ts test/unit/gitDiffEditor/*.test.ts
pnpm check
```

- [ ] **Step 3: Commit**

```bash
git commit -am "test(git-diff): acceptance for peek, gate, and inline precedence"
```

---

## Acceptance checklist

- [ ] Shared layer exists with `fileUri` identity + `sourceState.worktreeBytes`
- [ ] Exact vs nearest split enforced; mutations never nearest-fallback
- [ ] Per-file single-flight gate; centralized validation
- [ ] Raw unified peek; pure adds open
- [ ] `gitInline` thin adapter with B5 precedence
- [ ] `gitDiffEditor` aligned; `native` preserved
- [ ] Dangerous-transition unit tests green before chrome relied on mutations
- [ ] No Monaco/VS Code DiffEditor source copy

## Self-review (author)

1. **Spec coverage:** Tasks 1–4 = build-order step 1; Task 5–6 = gitGutter peek + mutations; Task 7 = gitInline; Task 8 = gitDiffEditor; Task 9 = acceptance/tokens. R1–R4 and B1–B6 mapped.
2. **Placeholders:** none intentional — host unstage API gap is explicitly “disable rather than fake”.
3. **Type consistency:** `DiffSnapshot` / `DiffHunk` / `HunkRef` / `ActionIntent` / `WorktreeBytes` / `createMutationGate` used throughout.
