/** Comparison side of a git diff. Identity is an oid or fingerprint, never a colour. */
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
  /** Required when base or target is WORKTREE (including empty → untracked). */
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
