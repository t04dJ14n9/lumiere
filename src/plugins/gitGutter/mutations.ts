import type {
  ActionIntent,
  DiffHunk,
  DiffSnapshot,
  MutationGate,
  MutationResult,
  SourceState,
} from "../../shared/git-diff";
import { worktreeBacked } from "../../shared/git-diff";

export interface GutterStageDeps {
  readSnapshot: () => Promise<DiffSnapshot>;
  readAuthoritativeSourceState: () => Promise<SourceState>;
  /**
   * Hunk-scoped stage. When omitted, Stage aborts and whole-file stage is not used.
   * There is no in-tree hunk stage API, so production omits this.
   */
  hunkStage?: (hunk: DiffHunk, snapshot: DiffSnapshot) => Promise<boolean>;
  /**
   * Whole-file `git.stage` / `saveAndStage`. The hunk path must not call it,
   * even after the exact-hunk gate has passed.
   */
  wholeFileStage: () => Promise<boolean>;
  backendWouldUseDiskBytes: boolean;
  canApplyExactBufferHunk: boolean;
}

/** Stage one validated hunk, or abort. Never widens to a whole-file stage. */
export async function runGutterStage(
  gate: MutationGate,
  fileKey: string,
  intent: ActionIntent,
  deps: GutterStageDeps,
): Promise<MutationResult> {
  if (!deps.hunkStage) {
    return { status: "aborted", reason: "no hunk-scoped stage backend" };
  }
  const apply = deps.hunkStage;
  return gate.run(fileKey, intent, {
    readSnapshot: deps.readSnapshot,
    readAuthoritativeSourceState: deps.readAuthoritativeSourceState,
    backendWouldUseDiskBytes: deps.backendWouldUseDiskBytes,
    canApplyExactBufferHunk: deps.canApplyExactBufferHunk,
    execute: async (hunk, snapshot) => ({ ok: await apply(hunk, snapshot) }),
  });
}

export async function runGutterRevert(
  gate: MutationGate,
  fileKey: string,
  intent: ActionIntent,
  deps: {
    readSnapshot: () => Promise<DiffSnapshot>;
    readAuthoritativeSourceState: () => Promise<SourceState>;
    applyRevert: (hunk: DiffHunk, snapshot: DiffSnapshot) => Promise<boolean>;
  },
): Promise<MutationResult> {
  return gate.run(fileKey, intent, {
    readSnapshot: deps.readSnapshot,
    readAuthoritativeSourceState: deps.readAuthoritativeSourceState,
    backendWouldUseDiskBytes: false,
    canApplyExactBufferHunk: true,
    execute: async (hunk, snapshot) => ({
      ok: await deps.applyRevert(hunk, snapshot),
    }),
  });
}

/** Stage stays off without a hunk backend, and when the worktree operand is missing or dirty-on-disk. */
export function stageControlEnabled(
  snapshot: DiffSnapshot | undefined,
  hasHunkBackend: boolean,
): boolean {
  if (!hasHunkBackend || !snapshot) {
    return false;
  }
  if (worktreeBacked(snapshot) && !snapshot.sourceState.worktreeBytes) {
    return false;
  }
  const bytes = snapshot.sourceState.worktreeBytes;
  if (bytes?.origin === "document" && bytes.isDirty) {
    return false;
  }
  return snapshot.hunks.some((hunk) => hunk.capabilities.canStage);
}

/** Revert edits the buffer. A WORKTREE snapshot without worktreeBytes cannot. */
export function revertControlEnabled(
  snapshot: DiffSnapshot | undefined,
): boolean {
  if (!snapshot) {
    return false;
  }
  if (worktreeBacked(snapshot) && !snapshot.sourceState.worktreeBytes) {
    return false;
  }
  return snapshot.hunks.some((hunk) => hunk.capabilities.canRevert);
}
