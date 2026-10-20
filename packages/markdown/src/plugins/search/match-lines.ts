import { parseSearch, type SearchQuery } from "../../markdown/search/query";

/** One content hit under a file result (Obsidian search-result-file-match). */
export interface MatchLine {
  text: string;
  offset: number;
  /** Highlight range within `text` for .search-result-file-matched-text. */
  mark?: { from: number; to: number };
}

const MAX_MATCHES = 25;
const MAX_LINE = 200;

type Needle =
  | { kind: "text"; value: string; sensitive: boolean }
  | { kind: "regex"; value: string; flags: string; sensitive: boolean };

/**
 * Collect content-oriented needles (skip file/path/tag/property and `not`).
 * Match-case / ignore-case scopes flip sensitivity for nested needles.
 */
export function contentNeedles(
  query: SearchQuery,
  sensitive = false,
): Needle[] {
  switch (query.kind) {
    case "text":
      return query.value
        ? [{ kind: "text", value: query.value, sensitive }]
        : [];
    case "regex":
      return query.value
        ? [
            {
              kind: "regex",
              value: query.value,
              flags: query.flags,
              sensitive,
            },
          ]
        : [];
    case "and":
    case "or":
      return query.terms.flatMap((term) => contentNeedles(term, sensitive));
    case "not":
    case "property":
      return [];
    case "scope":
      return scopeNeedles(query, sensitive);
  }
}

function scopeNeedles(
  query: { scope: string; term: SearchQuery },
  sensitive: boolean,
): Needle[] {
  if (
    query.scope === "file" ||
    query.scope === "path" ||
    query.scope === "tag"
  ) {
    return [];
  }
  if (query.scope === "match-case") {
    return contentNeedles(query.term, true);
  }
  if (query.scope === "ignore-case") {
    return contentNeedles(query.term, false);
  }
  return contentNeedles(query.term, sensitive);
}

/** Scan note text for lines matching content needles of `querySource`. */
export function extractMatchLines(
  text: string,
  querySource: string,
  limit = MAX_MATCHES,
): MatchLine[] {
  if (!text || limit <= 0) {
    return [];
  }
  let query: SearchQuery;
  try {
    query = parseSearch(querySource);
  } catch {
    return [];
  }
  const needles = contentNeedles(query);
  if (needles.length === 0) {
    return [];
  }
  const out: MatchLine[] = [];
  let offset = 0;
  const lines = text.split("\n");
  for (const line of lines) {
    if (out.length >= limit) {
      break;
    }
    const hit = firstHit(line, needles);
    if (hit) {
      out.push(clipLine(line, offset, hit.from, hit.to));
    }
    offset += line.length + 1;
  }
  return out;
}

function firstHit(
  line: string,
  needles: Needle[],
): { from: number; to: number } | undefined {
  let best: { from: number; to: number } | undefined;
  for (const needle of needles) {
    const hit = needleHit(line, needle);
    if (!hit) {
      continue;
    }
    if (!best || hit.from < best.from) {
      best = hit;
    }
  }
  return best;
}

function needleHit(
  line: string,
  needle: Needle,
): { from: number; to: number } | undefined {
  if (needle.kind === "regex") {
    const flags = [
      ...new Set(
        needle.flags.replace(/g/g, "") + (needle.sensitive ? "" : "i"),
      ),
    ].join("");
    try {
      const match = new RegExp(needle.value, flags).exec(line);
      if (!match || match[0] === undefined) {
        return undefined;
      }
      return { from: match.index, to: match.index + match[0].length };
    } catch {
      return undefined;
    }
  }
  const hay = needle.sensitive ? line : line.toLowerCase();
  const needleText = needle.sensitive
    ? needle.value
    : needle.value.toLowerCase();
  const at = hay.indexOf(needleText);
  if (at < 0) {
    return undefined;
  }
  return { from: at, to: at + needle.value.length };
}

function clipLine(
  line: string,
  offset: number,
  from: number,
  to: number,
): MatchLine {
  if (line.length <= MAX_LINE) {
    return {
      text: line,
      offset,
      ...(from < to ? { mark: { from, to } } : {}),
    };
  }
  const width = Math.max(1, to - from);
  const pad = Math.max(0, Math.floor((MAX_LINE - width) / 2));
  let start = Math.max(0, from - pad);
  const end = Math.min(line.length, start + MAX_LINE);
  start = Math.max(0, end - MAX_LINE);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < line.length ? "…" : "";
  const text = prefix + line.slice(start, end) + suffix;
  const markFrom = from - start + prefix.length;
  const markTo = to - start + prefix.length;
  return {
    text,
    offset: offset + start,
    ...(from < to ? { mark: { from: markFrom, to: markTo } } : {}),
  };
}
