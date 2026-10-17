import type { GitBlameOk } from "./types";

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
  const fields = porcelainFields(lines.slice(1));
  const authorDate = Number(fields.get("author-time")) || 0;
  const committerDate = Number(fields.get("committer-time")) || 0;
  return {
    status: "ok",
    blame: {
      commit: oid,
      shortCommit: oid.slice(0, 7),
      authorName: fields.get("author") ?? "",
      authorEmail: (fields.get("author-mail") ?? "").replace(/^<|>$/g, ""),
      authorDate,
      subject: fields.get("summary") ?? "",
      body: "",
      line,
      ...(committerDate > 0 ? { committerDate } : {}),
      ...(fields.has("boundary") ? { boundary: true } : {}),
    },
  };
}

/**
 * Header rows of one porcelain entry as key → value ("author Ada" → author:
 * "Ada"; a bare "boundary" row → boundary: ""). The content row (tab-prefixed)
 * is skipped.
 */
function porcelainFields(rows: readonly string[]): Map<string, string> {
  const fields = new Map<string, string>();
  for (const row of rows) {
    if (!row || row.startsWith("\t")) {
      continue;
    }
    const space = row.indexOf(" ");
    if (space < 0) {
      fields.set(row, "");
    } else {
      fields.set(row.slice(0, space), row.slice(space + 1));
    }
  }
  return fields;
}
