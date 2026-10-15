import type { GitBlameOk } from "./types";

// src/shared/git-blame/porcelain.ts
/** Synthetic uncommitted OID — length-agnostic (SHA-1 or SHA-256). */
export function isZeroOid(oid: string): boolean {
  return oid.length > 0 && /^0+$/.test(oid);
}

export type ParsedBlame =
  | { status: "ok"; blame: GitBlameOk }
  | { status: "uncommitted" }
  | { status: "unavailable" };

/**
 * Parse `git blame --line-porcelain` for a single -L line.
 * Uncommitted ONLY when the hunk header OID matches /^0+$/.
 * Porcelain `boundary` is informational; non-zero OID stays attributable.
 */
export function parseBlamePorcelain(stdout: string, line: number): ParsedBlame {
  const lines = stdout.split("\n");
  const header = lines[0]?.split(" ");
  const oid = header?.[0];
  if (
    !oid ||
    !/^[a-f0-9]{40,64}$/.test(oid) ||
    !lines.some((row) => row.startsWith("\t"))
  ) {
    return { status: "unavailable" };
  }
  if (isZeroOid(oid)) {
    return { status: "uncommitted" };
  }
  let authorName = "";
  let authorEmail = "";
  let authorDate = 0;
  let subject = "";
  let boundary = false;
  for (const row of lines.slice(1)) {
    if (row.startsWith("author ")) {
      authorName = row.slice(7);
    } else if (row.startsWith("author-mail ")) {
      authorEmail = row.slice(12).replace(/^<|>$/g, "");
    } else if (row.startsWith("author-time ")) {
      authorDate = Number(row.slice(12)) || 0;
    } else if (row.startsWith("summary ")) {
      subject = row.slice(8);
    } else if (row === "boundary") {
      boundary = true;
    }
  }
  return {
    status: "ok",
    blame: {
      commit: oid,
      shortCommit: oid.slice(0, 7),
      authorName,
      authorEmail,
      authorDate,
      subject,
      line,
      ...(boundary ? { boundary: true } : {}),
    },
  };
}
