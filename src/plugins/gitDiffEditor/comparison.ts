import {
  comparisonTitle,
  snapshotSideFromUri,
  sourceStateForSides,
} from "../../shared/git-diff";
import type { DiffSide, SourceState } from "../../shared/git-diff";

export interface DescribedComparison {
  readonly base: DiffSide;
  readonly target: DiffSide;
  readonly sourceState: SourceState;
}

/** Structured sides for a Source Control or Timeline comparison. */
export function describedComparison(
  original: string,
  modified: string,
): DescribedComparison {
  const base = snapshotSideFromUri(original);
  const target = snapshotSideFromUri(modified);
  return {
    base,
    target,
    sourceState: sourceStateForSides(base, target),
  };
}

export function urisForSides(
  fileUri: string,
  base: DiffSide,
  target: DiffSide,
  toGitUri: (uri: string, ref: string) => string | undefined,
): { original: string; modified: string } | undefined {
  const original = uriForSide(fileUri, base, toGitUri);
  const modified = uriForSide(fileUri, target, toGitUri);
  if (!original || !modified) {
    return undefined;
  }
  return { original, modified };
}

function uriForSide(
  fileUri: string,
  side: DiffSide,
  toGitUri: (uri: string, ref: string) => string | undefined,
): string | undefined {
  if (side.kind === "WORKTREE") {
    return fileUri;
  }
  if (side.kind === "HEAD") {
    return toGitUri(fileUri, "HEAD");
  }
  if (side.kind === "INDEX") {
    return toGitUri(fileUri, "~");
  }
  if (side.kind === "revision") {
    return toGitUri(fileUri, side.ref);
  }
  return undefined;
}

export function titledComparison(
  file: string,
  baseLabel: string,
  targetLabel: string,
): string {
  return comparisonTitle(file, baseLabel, targetLabel);
}
