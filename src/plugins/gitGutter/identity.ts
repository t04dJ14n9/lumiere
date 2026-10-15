import type { DiffHunk } from "../../shared/git-diff";
import type { DocHunk } from "./api";

/**
 * The same change payload. Context rows and modified-side line numbers are
 * ignored, so an edit above the change can mint a new hunk id. A different
 * added or deleted line, including a grown hunk, is not the same change.
 */
export function sameChange(left: DiffHunk, right: DiffHunk): boolean {
  if (left.originalRange.startLine !== right.originalRange.startLine) {
    return false;
  }
  if (left.originalRange.endLine !== right.originalRange.endLine) {
    return false;
  }
  return changePayload(left) === changePayload(right);
}

/** Delete and add lines, in order. Context and line numbers are omitted. */
function changePayload(hunk: DiffHunk): string {
  return hunk.lines
    .filter((line) => line.kind !== "context")
    .map((line) => `${line.kind}\0${line.text}`)
    .join("\n");
}

/** Baseline identity: the comparison side, which mapping an edit does not change. */
export function sameBaseline(candidate: DiffHunk, hunk: DocHunk): boolean {
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
