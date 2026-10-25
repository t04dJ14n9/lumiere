import { getDomDocument } from "./dom-helpers";
import { splitLinktext } from "../../shared/vault-path";
import type { CachedMetadata } from "./obsidian-metadata";

export function getAllTags(
  cache: CachedMetadata | null | undefined,
): string[] | null {
  if (!cache) {
    return null;
  }
  const tags = (cache.tags ?? []).map((item) =>
    item.tag.startsWith("#") ? item.tag : `#${item.tag}`,
  );
  for (const tag of parseFrontMatterTags(cache.frontmatter) ?? []) {
    if (!tags.includes(tag)) {
      tags.push(tag);
    }
  }
  return tags.length > 0 ? tags : null;
}

export function parseFrontMatterEntry(
  frontmatter: Record<string, unknown> | null | undefined,
  key: string | RegExp,
): unknown {
  if (!frontmatter || typeof frontmatter !== "object") {
    return null;
  }
  for (const [k, v] of Object.entries(frontmatter)) {
    const matches =
      typeof key === "string"
        ? k.toLowerCase() === key.toLowerCase()
        : key.test(k);
    if (matches) {
      return v;
    }
  }
  return null;
}

export function parseFrontMatterStringArray(
  frontmatter: Record<string, unknown> | null | undefined,
  key: string | RegExp,
  nospaces = false,
): string[] | null {
  const entry = parseFrontMatterEntry(frontmatter, key);
  if (entry === null || entry === undefined) {
    return null;
  }
  let rawItems: unknown[] = [];
  if (Array.isArray(entry)) {
    rawItems = entry;
  } else if (typeof entry === "string") {
    rawItems = entry.split(nospaces ? /[\s,]+/ : /\s*,\s*/);
  }
  const out = rawItems
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
  return out.length > 0 ? out : null;
}

export function parseFrontMatterAliases(
  frontmatter: Record<string, unknown> | null | undefined,
): string[] | null {
  return parseFrontMatterStringArray(frontmatter, /^alias(es)?$/i, false);
}

export function parseFrontMatterTags(
  frontmatter: Record<string, unknown> | null | undefined,
): string[] | null {
  const items = parseFrontMatterStringArray(frontmatter, /^tags?$/i, true);
  return items ? items.map((t) => (t.startsWith("#") ? t : `#${t}`)) : null;
}

export function getFrontMatterInfo(content: string) {
  const match = /^---[ \t]*\r?\n([\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/.exec(
    content,
  );
  if (!match) {
    return { exists: false, frontmatter: "", from: 0, to: 0, contentStart: 0 };
  }
  const openLen = /^---[ \t]*\r?\n/.exec(match[0])?.[0].length ?? 4;
  const body = match[1] ?? "";
  return {
    exists: true,
    frontmatter: body,
    from: openLen,
    to: openLen + body.length,
    contentStart: match[0].length,
  };
}

export function parseLinktext(linktext: string) {
  return splitLinktext(linktext);
}

export function getLinkpath(linktext: string): string {
  return splitLinktext(linktext).path;
}

export function stripHeading(heading: string): string {
  return String(heading ?? "")
    .replace(/[`*~_[\]#|^\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripHeadingForLink(heading: string): string {
  return String(heading ?? "")
    .replace(/[[\]#|^\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveSubpath(
  cache: CachedMetadata | null | undefined,
  subpath: string,
) {
  const clean = subpath ? subpath.replace(/^#/, "").trim() : "";
  if (!cache || !clean) {
    return null;
  }
  if (clean.startsWith("^")) {
    const block = cache.blocks?.[clean.slice(1).toLowerCase()];
    return block
      ? {
          type: "block" as const,
          current: block,
          start: block.position.start,
          end: block.position.end,
        }
      : null;
  }
  const target = stripHeading(clean).toLowerCase();
  const headings = cache.headings ?? [];
  const idx = headings.findIndex(
    (h) => stripHeading(h.heading).toLowerCase() === target,
  );
  if (idx < 0) {
    return null;
  }
  const current = headings[idx]!;
  const next = headings.slice(idx + 1).find((h) => h.level <= current.level);
  return {
    type: "heading" as const,
    current,
    next,
    start: current.position.start,
    end: next ? next.position.start : null,
  };
}

export interface SearchResult {
  score: number;
  matches: Array<[number, number]>;
}

export function prepareSimpleSearch(
  query: string,
): (text: string) => SearchResult | null {
  const needle = String(query ?? "")
    .toLowerCase()
    .trim();
  return (text: string) => {
    if (!needle) {
      return { score: 0, matches: [] };
    }
    const idx = String(text ?? "")
      .toLowerCase()
      .indexOf(needle);
    return idx < 0
      ? null
      : { score: -idx, matches: [[idx, idx + needle.length]] };
  };
}

export function prepareFuzzySearch(
  query: string,
): (text: string) => SearchResult | null {
  const needle = String(query ?? "")
    .toLowerCase()
    .trim();
  return (text: string) => {
    if (!needle) {
      return { score: 0, matches: [] };
    }
    const hay = String(text ?? "").toLowerCase();
    const matches: Array<[number, number]> = [];
    let cursor = 0;
    for (let i = 0; i < needle.length; i++) {
      const found = hay.indexOf(needle[i]!, cursor);
      if (found < 0) {
        return null;
      }
      const prev = matches[matches.length - 1];
      if (prev && prev[1] === found) {
        prev[1] = found + 1;
      } else {
        matches.push([found, found + 1]);
      }
      cursor = found + 1;
    }
    return { score: -matches.length, matches };
  };
}

export function prepareQuery(query: string) {
  const clean = String(query ?? "")
    .trim()
    .toLowerCase();
  return { query: clean, tokens: clean ? clean.split(/\s+/) : [] };
}

export function fuzzySearch(
  prepared: { query: string },
  text: string,
): SearchResult | null {
  return prepareFuzzySearch(prepared.query)(text);
}

export function renderMatches(
  el: HTMLElement | DocumentFragment,
  text: string,
  matches: ReadonlyArray<[number, number]> | null | undefined,
): void {
  if (!matches || matches.length === 0) {
    el.appendChild(getDomDocument().createTextNode(text));
    return;
  }
  let pos = 0;
  for (const [start, end] of matches) {
    if (start > pos) {
      el.appendChild(getDomDocument().createTextNode(text.slice(pos, start)));
    }
    const span = getDomDocument().createElement("span");
    span.className = "suggestion-highlight";
    span.textContent = text.slice(start, end);
    el.appendChild(span);
    pos = end;
  }
  if (pos < text.length) {
    el.appendChild(getDomDocument().createTextNode(text.slice(pos)));
  }
}

export function renderResults(
  el: HTMLElement,
  text: string,
  result: SearchResult,
): void {
  renderMatches(el, text, result.matches);
}

export function sortSearchResults<T extends { match: SearchResult }>(
  results: T[],
): void {
  results.sort((a, b) => b.match.score - a.match.score);
}
