import type { DiffSide, LineRange, LineRecord } from "./types";
import { sha256Hex } from "./sha256";

export function hunkFingerprint(input: {
  originalRange: LineRange;
  modifiedRange: LineRange;
  lines: readonly LineRecord[];
  baseKey: string;
  targetKey: string;
}): string {
  const parts = [
    input.baseKey,
    input.targetKey,
    `${input.originalRange.startLine}:${input.originalRange.endLine}`,
    `${input.modifiedRange.startLine}:${input.modifiedRange.endLine}`,
  ];
  for (const line of input.lines) {
    parts.push(
      line.kind,
      String(line.originalLine ?? ""),
      String(line.modifiedLine ?? ""),
      line.text,
    );
  }
  return sha256Hex(parts.join("\0")).slice(0, 32);
}

export function textFingerprint(text: string): string {
  return sha256Hex(text).slice(0, 32);
}

export function sideKey(side: DiffSide): string {
  if (side.kind === "HEAD") {
    return `HEAD:${side.oid}`;
  }
  if (side.kind === "INDEX") {
    return `INDEX:${side.fingerprint}`;
  }
  if (side.kind === "revision") {
    return `revision:${side.ref}:${side.oid}`;
  }
  if (side.kind === "empty") {
    return "empty";
  }
  return "WORKTREE";
}

/** Stable token stored in `sourceState` for one comparison side. */
export function sideToken(side: DiffSide): string {
  if (side.kind === "HEAD" || side.kind === "revision") {
    return side.oid;
  }
  if (side.kind === "INDEX") {
    return side.fingerprint;
  }
  if (side.kind === "empty") {
    return "empty";
  }
  return "WORKTREE";
}
