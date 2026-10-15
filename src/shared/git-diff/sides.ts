import type { DiffSide, SourceState, WorktreeBytes } from "./types";
import { sideToken } from "./fingerprint";

/** The `ref` query of a `git:` URI, or undefined when the URI is not one. */
export function gitRefOf(uri: string): string | undefined {
  if (!uri.startsWith("git:")) {
    return undefined;
  }
  const queryAt = uri.indexOf("?");
  if (queryAt < 0) {
    return undefined;
  }
  try {
    const query = decodeURIComponent(uri.slice(queryAt + 1));
    const ref = (JSON.parse(query) as { ref?: unknown }).ref;
    return typeof ref === "string" ? ref : "";
  } catch {
    return undefined;
  }
}

/** Map a comparison URI into a structured side. File URIs are the worktree. */
export function snapshotSideFromUri(uri: string): DiffSide {
  if (!uri.startsWith("git:")) {
    return { kind: "WORKTREE" };
  }
  const ref = gitRefOf(uri);
  if (ref === undefined) {
    return { kind: "revision", ref: "", oid: "" };
  }
  if (ref === "" || ref === "~") {
    return { kind: "INDEX", fingerprint: "index" };
  }
  if (ref === "HEAD") {
    return { kind: "HEAD", oid: "HEAD" };
  }
  return { kind: "revision", ref, oid: ref };
}

export function sourceStateForSides(
  base: DiffSide,
  target: DiffSide,
  worktreeBytes?: WorktreeBytes,
): SourceState {
  return {
    baseOidOrFingerprint: sideToken(base),
    targetOidOrFingerprint: sideToken(target),
    ...(worktreeBytes ? { worktreeBytes } : {}),
  };
}

export function comparisonTitle(
  file: string,
  baseLabel: string,
  targetLabel: string,
): string {
  return `${file} (${baseLabel} → ${targetLabel})`;
}
