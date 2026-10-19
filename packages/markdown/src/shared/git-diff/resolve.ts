import type {
  DiffHunk,
  DiffSnapshot,
  HunkRef,
  SourceState,
  WorktreeBytes,
} from "./types";

export {
  hunkFingerprint,
  sideKey,
  sideToken,
  textFingerprint,
} from "./fingerprint";

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
  if (a === undefined && b === undefined) {
    return true;
  }
  if (!a || !b || a.origin !== b.origin) {
    return false;
  }
  if (a.origin === "document" && b.origin === "document") {
    return (
      a.uri === b.uri && a.version === b.version && a.isDirty === b.isDirty
    );
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
  if (snapshot.generationId !== ref.generationId) {
    return undefined;
  }
  return snapshot.hunks.find((hunk) => hunk.hunkId === ref.hunkId);
}

/** UI continuity only — never use for Stage, Unstage, or Revert. */
export function resolveNearestHunk(
  snapshot: DiffSnapshot,
  previous: DiffHunk,
): DiffHunk | undefined {
  if (snapshot.hunks.length === 0) {
    return undefined;
  }
  const exact = snapshot.hunks.find((hunk) => hunk.hunkId === previous.hunkId);
  if (exact) {
    return exact;
  }
  return nearestByModifiedMidpoint(snapshot.hunks, previous);
}

function nearestByModifiedMidpoint(
  hunks: readonly DiffHunk[],
  previous: DiffHunk,
): DiffHunk | undefined {
  const targetMid =
    (previous.modifiedRange.startLine + previous.modifiedRange.endLine) / 2;
  let best: DiffHunk | undefined;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const hunk of hunks) {
    const mid = (hunk.modifiedRange.startLine + hunk.modifiedRange.endLine) / 2;
    const dist = Math.abs(mid - targetMid);
    if (dist < bestDist) {
      best = hunk;
      bestDist = dist;
    }
  }
  return best;
}
