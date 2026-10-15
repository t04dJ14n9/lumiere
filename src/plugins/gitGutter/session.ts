import {
  buildWorktreeSnapshot,
  createMutationGate,
  resolveExactHunk,
  resolveNearestHunk,
  textFingerprint,
} from "../../shared/git-diff";
import type { MutationGate } from "../../shared/git-diff";
import type {
  DiffHunk,
  DiffSnapshot,
  HunkRef,
  LineRecord,
} from "../../shared/git-diff";
import type { DocHunk } from "./api";
import type { PeekPosition } from "./peek";
import { peekRef } from "./peek";

/** The gutter's published snapshot for one editor, rebuilt when the baseline or buffer changes. */
export class DiffSession {
  snapshot: DiffSnapshot | undefined;
  readonly gate: MutationGate = createMutationGate();
  private version = 0;

  constructor(private readonly compareTo: "HEAD" | "index") {}

  publish(fileUri: string, baseline: string, doc: string): DiffSnapshot {
    this.version += 1;
    const token = textFingerprint(baseline);
    const base =
      this.compareTo === "index"
        ? ({ kind: "INDEX", fingerprint: token } as const)
        : ({ kind: "HEAD", oid: token } as const);
    this.snapshot = buildWorktreeSnapshot({
      repository: fileUri,
      fileUri,
      baseText: baseline,
      targetText: doc,
      base,
      target: { kind: "WORKTREE" },
      worktreeBytes: {
        origin: "document",
        uri: fileUri,
        version: this.version,
        isDirty: true,
      },
      liveDocumentUri: fileUri,
      mapLiveAnchor: ({ modifiedFrom, modifiedTo }) => ({
        uri: fileUri,
        from: modifiedFrom,
        to: modifiedTo,
      }),
      // No hunk-scoped stage/unstage backend exists. Revert edits this buffer.
      capabilitiesFor: () => ({
        canStage: false,
        canUnstage: false,
        canRevert: true,
      }),
      computedAt: this.version,
    });
    return this.snapshot;
  }

  clear(): void {
    this.snapshot = undefined;
  }

  refFor(hunk: DocHunk): HunkRef | undefined {
    const found = this.hunkFor(hunk);
    if (!found || !this.snapshot) {
      return undefined;
    }
    return { generationId: this.snapshot.generationId, hunkId: found.hunkId };
  }

  linesFor(hunk: DocHunk): readonly LineRecord[] {
    return this.hunkFor(hunk)?.lines ?? [];
  }

  /**
   * Keep an open peek on the same hunk, or the nearest survivor for display.
   * Returns null when nothing remains. Does not retarget a mutation.
   */
  rematch(
    previous: DiffSnapshot | undefined,
    open: PeekPosition | null,
    docHunks: readonly DocHunk[],
  ): PeekPosition | null {
    if (open === null || !this.snapshot) {
      return null;
    }
    const ref = peekRef(open);
    if (ref && resolveExactHunk(this.snapshot, ref)) {
      return open;
    }
    const prior = previous?.hunks.find(
      (hunk) =>
        hunk.hunkId === ref?.hunkId && hunk.generationId === ref?.generationId,
    );
    if (!prior) {
      return typeof open === "number" ? open : null;
    }
    return this.anchorNearest(prior, docHunks);
  }

  /**
   * The snapshot hunk for a document hunk. Offsets match until an edit maps
   * the bar; after that the baseline line and text still identify it. A
   * mapped bar must not miss the gate, and an ambiguous match must not guess.
   */
  private hunkFor(hunk: DocHunk): DiffHunk | undefined {
    const atOffset = this.snapshot?.hunks.find(
      (candidate) => candidate.liveAnchor?.from === hunk.from,
    );
    if (atOffset) {
      return atOffset;
    }
    const matches = (this.snapshot?.hunks ?? []).filter((candidate) =>
      sameBaseline(candidate, hunk),
    );
    return matches.length === 1 ? matches[0] : undefined;
  }

  private anchorNearest(
    prior: DiffHunk,
    docHunks: readonly DocHunk[],
  ): PeekPosition | null {
    const nearest = this.snapshot
      ? resolveNearestHunk(this.snapshot, prior)
      : undefined;
    const at = nearest?.liveAnchor?.from;
    const doc =
      at === undefined ? undefined : docHunks.find((hunk) => hunk.from === at);
    if (!nearest || !this.snapshot || !doc) {
      return null;
    }
    return {
      at: doc.from,
      ref: { generationId: this.snapshot.generationId, hunkId: nearest.hunkId },
    };
  }
}

/** Baseline identity: the comparison side, which mapping an edit does not change. */
function sameBaseline(candidate: DiffHunk, hunk: DocHunk): boolean {
  if (candidate.originalRange.startLine + 1 !== hunk.oldLine) {
    return false;
  }
  const removed = candidate.lines.filter((line) => line.kind === "delete");
  const added = candidate.lines.some((line) => line.kind === "add");
  if (changeKind(removed.length > 0, added) !== hunk.kind) {
    return false;
  }
  return removed.map((line) => line.text).join("\n") === hunk.old;
}

function changeKind(hasRemoved: boolean, hasAdded: boolean): DocHunk["kind"] {
  if (hasRemoved && hasAdded) {
    return "modified";
  }
  if (hasRemoved) {
    return "deleted";
  }
  return "added";
}
