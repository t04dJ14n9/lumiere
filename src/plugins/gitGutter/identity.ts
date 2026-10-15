import type { DiffHunk } from "../../shared/git-diff";
import type { DocHunk } from "./api";

/**
 * The same baseline change. A hunk id also covers context lines, so an edit
 * above the change mints a new id without being a different revert target.
 */
export function sameChange(left: DiffHunk, right: DiffHunk): boolean {
  if (left.originalRange.startLine !== right.originalRange.startLine) {
    return false;
  }
  if (left.originalRange.endLine !== right.originalRange.endLine) {
    return false;
  }
  if (removedText(left) !== removedText(right)) {
    return false;
  }
  return hasAdded(left) === hasAdded(right);
}

function removedText(hunk: DiffHunk): string {
  return hunk.lines
    .filter((line) => line.kind === "delete")
    .map((line) => line.text)
    .join("\n");
}

function hasAdded(hunk: DiffHunk): boolean {
  return hunk.lines.some((line) => line.kind === "add");
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
