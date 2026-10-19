import { resolveExactHunk, sourceStateEquals } from "./resolve";
import type {
  ActionIntent,
  DiffHunk,
  DiffSnapshot,
  SourceState,
} from "./types";

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
  /**
   * Must mutate **only** the gate-validated hunk (exact patch / hunk-scoped API).
   * Must **not** call whole-file `git.stage` / `saveAndStage`.
   */
  execute: (hunk: DiffHunk, snapshot: DiffSnapshot) => Promise<{ ok: boolean }>;
}

export function worktreeBacked(snapshot: DiffSnapshot): boolean {
  return (
    snapshot.base.kind === "WORKTREE" || snapshot.target.kind === "WORKTREE"
  );
}

export function mutationsAllowedForWorktree(
  intentState: SourceState,
  authState: SourceState,
  snapshot: DiffSnapshot,
  deps: Pick<
    MutationDeps,
    "backendWouldUseDiskBytes" | "canApplyExactBufferHunk"
  >,
): { ok: true } | { ok: false; reason: string } {
  if (!sourceStateEquals(intentState, authState)) {
    return { ok: false, reason: "sourceState mismatch" };
  }
  const wt = intentState.worktreeBytes;
  // R4 fail-closed: a WORKTREE comparison side requires authoritative worktreeBytes.
  if (worktreeBacked(snapshot) && !wt) {
    return { ok: false, reason: "WORKTREE side missing worktreeBytes" };
  }
  if (!wt) {
    return { ok: true };
  }
  if (
    wt.origin === "document" &&
    deps.backendWouldUseDiskBytes &&
    !deps.canApplyExactBufferHunk
  ) {
    return {
      ok: false,
      reason: "worktreeBytes document vs disk backend mismatch",
    };
  }
  if (
    wt.origin === "document" &&
    wt.isDirty &&
    deps.backendWouldUseDiskBytes &&
    !deps.canApplyExactBufferHunk
  ) {
    return {
      ok: false,
      reason: "dirty document buffer; no exact in-memory hunk backend",
    };
  }
  return { ok: true };
}

function capabilityRefusal(
  intent: ActionIntent,
  hunk: DiffHunk,
): string | undefined {
  if (intent.action === "stage" && !hunk.capabilities.canStage) {
    return "cannot stage";
  }
  if (intent.action === "unstage" && !hunk.capabilities.canUnstage) {
    return "cannot unstage";
  }
  if (intent.action === "revert" && !hunk.capabilities.canRevert) {
    return "cannot revert";
  }
  return undefined;
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
      if (pending.has(fileKey)) {
        return { status: "busy" };
      }
      pending.add(fileKey);
      try {
        return await runChecked(intent, deps);
      } catch (error) {
        return { status: "error", error };
      } finally {
        pending.delete(fileKey);
      }
    },
  };
}

async function runChecked(
  intent: ActionIntent,
  deps: MutationDeps,
): Promise<MutationResult> {
  const auth = await deps.readAuthoritativeSourceState();
  const snapshot = await deps.readSnapshot();
  const allowed = mutationsAllowedForWorktree(
    intent.sourceState,
    auth,
    snapshot,
    deps,
  );
  if (!allowed.ok) {
    return { status: "aborted", reason: allowed.reason };
  }
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
  if (!hunk) {
    return { status: "aborted", reason: "hunk disappeared" };
  }
  const refused = capabilityRefusal(intent, hunk);
  if (refused) {
    return { status: "aborted", reason: refused };
  }
  const executed = await deps.execute(hunk, snapshot);
  return executed.ok
    ? { status: "ok" }
    : { status: "aborted", reason: "execute failed" };
}

export type MutationGate = ReturnType<typeof createMutationGate>;
