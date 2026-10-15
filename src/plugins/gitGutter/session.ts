import {
  buildWorktreeSnapshot,
  createMutationGate,
  resolveExactHunk,
  resolveNearestHunk,
  sideToken,
  textFingerprint,
} from "../../shared/git-diff";
import type { MutationGate } from "../../shared/git-diff";
import type {
  DiffHunk,
  DiffSnapshot,
  HunkRef,
  LineRecord,
  SourceState,
} from "../../shared/git-diff";
import type { DocHunk } from "./api";
import { sameBaseline, sameChange } from "./identity";
import { revertControlEnabled } from "./mutations";
import type { PeekPosition } from "./peek";
import { peekRef } from "./peek";

/** The gutter's published snapshot for one editor, rebuilt when the baseline or buffer changes. */
export class DiffSession {
  snapshot: DiffSnapshot | undefined;
  readonly gate: MutationGate = createMutationGate();
  /** Bumps on every distinct buffer text, including edits before the next publish. */
  private docVersion = 0;
  private docText = "";
  private baseline = "";
  private baselineToken = "";

  constructor(private readonly compareTo: "HEAD" | "index") {}

  /** Record the live buffer. A later gate read sees this version, not the click's. */
  noteDocument(text: string): void {
    if (text === this.docText) {
      return;
    }
    this.docText = text;
    this.docVersion += 1;
  }

  baselineText(): string {
    return this.baseline;
  }

  /** Identity of the buffer and baseline as they are now, not when a click closed over them. */
  authoritativeSourceState(): SourceState | undefined {
    const snap = this.snapshot;
    if (!snap) {
      return undefined;
    }
    return {
      baseOidOrFingerprint: this.baselineToken,
      targetOidOrFingerprint: sideToken(snap.target),
      worktreeBytes: {
        origin: "document",
        uri: snap.fileUri,
        version: this.docVersion,
        isDirty: true,
      },
    };
  }

  publish(fileUri: string, baseline: string, doc: string): DiffSnapshot {
    this.noteBaseline(baseline);
    this.noteDocument(doc);
    const base =
      this.compareTo === "index"
        ? ({ kind: "INDEX", fingerprint: this.baselineToken } as const)
        : ({ kind: "HEAD", oid: this.baselineToken } as const);
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
        version: this.docVersion,
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
      computedAt: this.docVersion,
    });
    return this.snapshot;
  }

  private noteBaseline(baseline: string): void {
    if (baseline === this.baseline) {
      return;
    }
    this.baseline = baseline;
    this.baselineToken = textFingerprint(baseline);
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
   * Keep an open peek on the same hunk, or move the anchor to a neighbor for
   * display only. A true nearest fallback keeps the original mutation ref, so
   * Revert exact-gates the disappeared hunk and aborts.
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
    const survived = this.uniqueSurvivor(prior);
    if (survived) {
      return this.anchor(survived, docHunks, {
        generationId: this.snapshot.generationId,
        hunkId: survived.hunkId,
      });
    }
    return this.displayNearest(prior, docHunks, {
      generationId: prior.generationId,
      hunkId: prior.hunkId,
    });
  }

  /** True only when the peek ref is still that exact hunk in the current snapshot. */
  mutationAllowed(open: PeekPosition | null): boolean {
    const ref = peekRef(open);
    const snap = this.snapshot;
    if (!ref || !snap || !revertControlEnabled(snap)) {
      return false;
    }
    return Boolean(resolveExactHunk(snap, ref)?.capabilities.canRevert);
  }

  /**
   * The current hunk with this baseline change. More than one match is
   * ambiguous, so the caller keeps the old ref and Revert stays off.
   */
  private uniqueSurvivor(prior: DiffHunk): DiffHunk | undefined {
    const matches = (this.snapshot?.hunks ?? []).filter((hunk) =>
      sameChange(hunk, prior),
    );
    return matches.length === 1 ? matches[0] : undefined;
  }

  /**
   * The snapshot hunk with this baseline identity. An offset match that is a
   * different change is not used: that would let a neighbor become the edit.
   */
  private hunkFor(hunk: DocHunk): DiffHunk | undefined {
    const matches = (this.snapshot?.hunks ?? []).filter((candidate) =>
      sameBaseline(candidate, hunk),
    );
    return matches.length === 1 ? matches[0] : undefined;
  }

  /** Move the caret to a neighbor. The ref stays the hunk that disappeared. */
  private displayNearest(
    prior: DiffHunk,
    docHunks: readonly DocHunk[],
    original: HunkRef,
  ): PeekPosition | null {
    if (!this.snapshot) {
      return null;
    }
    const nearest = resolveNearestHunk(this.snapshot, prior);
    if (!nearest || nearest.hunkId === prior.hunkId) {
      return null;
    }
    return this.anchor(nearest, docHunks, original);
  }

  private anchor(
    hunk: DiffHunk,
    docHunks: readonly DocHunk[],
    ref: HunkRef,
  ): PeekPosition | null {
    const at = hunk.liveAnchor?.from;
    if (at === undefined) {
      return null;
    }
    const doc = docHunks.find((item) => item.from === at);
    if (!doc) {
      return null;
    }
    return { at: doc.from, ref };
  }
}
