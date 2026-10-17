import type { EditorState, StateField } from "@codemirror/state";
import type { Disposer } from "@workshop/core";
import type { DiffSide, HunkRef, LineRecord } from "../../shared/git-diff";

/** One change between the git baseline and the editor text, in document offsets. */
export interface DocHunk {
  readonly kind: "added" | "modified" | "deleted";
  /** Start of the first changed line; for `deleted`, the line the removal sits before. */
  readonly from: number;
  /** End of the last changed line; equals `from` for `deleted`. */
  readonly to: number;
  /** The baseline lines this hunk replaces, joined with "\n" ("" for `added`). */
  readonly old: string;
  /** 1-based first baseline line. */
  readonly oldLine: number;
  /** A removal after the last line of the note. */
  readonly atEnd: boolean;
}

export interface HunkSet {
  readonly hunks: readonly DocHunk[];
  /** Bumped when hunks are recomputed (not when they are only mapped through edits). */
  readonly generation: number;
}

export interface GitDiff {
  /** Hunks of the current editor state; read it in your own StateField to stay in sync. */
  readonly field: StateField<HunkSet>;
  status(): "loading" | "ok" | "untracked" | "unavailable" | "tooLarge";
  /** The baseline's label, e.g. "HEAD (a1c9f02)". */
  label(): string;
  baseline(): string | undefined;
  /** Replace a hunk with its baseline text: one undo step. */
  revert(hunk: DocHunk): void;
  onChange(listener: () => void): Disposer;
  /**
   * The range of the rendered blocks (top-level Markdown blocks, frontmatter)
   * a range touches: where a widget must go so a block's own widget does not hide it.
   */
  blockRange(
    state: EditorState,
    from: number,
    to: number,
  ): { from: number; to: number };
  /**
   * The whole enclosing blocks of a hunk, as they were and as they are, for
   * display; the hunk itself stays the edit Revert applies.
   */
  context(state: EditorState, hunk: DocHunk): { old: string; now: string };
  /**
   * Open the raw peek for a snapshot hunk. `at` is the decoration's mapped
   * position; when omitted, the snapshot live anchor is used.
   */
  openHunk(ref: HunkRef, at?: number): void;
  /** The snapshot hunk that shares this document offset, if one is published. */
  refFor(hunk: DocHunk): HunkRef | undefined;
  /** Raw unified lines for the peek body. */
  linesFor(hunk: DocHunk): readonly LineRecord[];
}

/** Open Full Diff carries the snapshot's sides, not a rediscovered HEAD comparison. */
export interface FullDiffRequest {
  readonly fileUri: string;
  readonly base: DiffSide;
  readonly target: DiffSide;
}

declare module "@workshop/core" {
  interface Services {
    gitDiff: GitDiff;
  }
  interface Events {
    /** @mode emit */ "git-diff:open-full": (request: FullDiffRequest) => void;
  }
}
