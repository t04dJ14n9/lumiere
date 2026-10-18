import { fuzzyScore } from "../../shared/fuzzy";
import type { Candidate } from "./candidates";
interface Ranked {
  entry: Candidate;
  score: number;
}

/**
 * Where every word of `query` is in `text` (each place it is, touching
 * places merged), or `undefined` when one is missing.
 */
function wordRanges(
  query: string,
  text: string,
): [number, number][] | undefined {
  const lower = text.toLowerCase();
  const found: [number, number][] = [];
  for (const word of query.toLowerCase().split(" ").filter(Boolean)) {
    let at = lower.indexOf(word);
    if (at < 0) {
      return undefined;
    }
    for (; at >= 0; at = lower.indexOf(word, at + word.length + 1)) {
      found.push([at, at + word.length]);
    }
  }
  found.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: [number, number][] = [];
  for (const range of found) {
    const previous = merged.at(-1);
    if (previous && previous[1] >= range[0]) {
      previous[1] = Math.max(previous[1], range[1]);
    } else {
      merged.push(range);
    }
  }
  return merged;
}

/**
 * A block's score, as Obsidian ranks blocks: every word of the query must be
 * in its text, or in its id, which ranks first; fewer, earlier pieces win.
 */
function blockScore(query: string, entry: Candidate): number | undefined {
  if (wordRanges(query, entry.label)) {
    return 0;
  }
  const ranges = wordRanges(query, entry.text);
  if (!ranges) {
    return undefined;
  }
  return ranges.length ? -(ranges.length + ranges[0]![0] / 10) : 0;
}

/** Obsidian's score for one suggestion, or `undefined` when it does not match. */
function scoreOf(query: string, entry: Candidate): number | undefined {
  if (entry.words) {
    return blockScore(query, entry);
  }
  const named = fuzzyScore(query, entry.text);
  if (named !== undefined) {
    return named - entry.penalty;
  }
  const path =
    entry.path === undefined ? undefined : fuzzyScore(query, entry.path);
  return path === undefined ? undefined : path - 1 - entry.penalty;
}

/** Most recently changed first, as Obsidian lists notes before anything is typed. */
function recency(entry: Candidate): number {
  return entry.value.kind === "file" ? entry.value.target.mtime : 0;
}

/**
 * The best 50 suggestions for `query`, best first; equal scores keep the
 * entries' order, as Obsidian's sort does. With nothing typed, notes come
 * most recently changed first (excluded ones left out) and headings in
 * document order.
 */
export function rankedCandidates(
  entries: readonly Candidate[],
  query: string,
): Candidate[] {
  if (!query) {
    return entries
      .filter((entry) => entry.penalty === 0)
      .sort((a, b) => recency(b) - recency(a))
      .slice(0, 50);
  }
  const best: Ranked[] = [];
  for (const entry of entries) {
    const score = scoreOf(query, entry);
    if (score === undefined) {
      continue;
    }
    if (best.length === 50 && score <= best[49]!.score) {
      continue;
    }
    // After every entry scoring the same, so equal scores keep their order.
    let from = 0;
    let to = best.length;
    while (from < to) {
      const middle = (from + to) >>> 1;
      if (score > best[middle]!.score) {
        to = middle;
      } else {
        from = middle + 1;
      }
    }
    best.splice(from, 0, { entry, score });
    if (best.length > 50) {
      best.pop();
    }
  }
  return best.map(({ entry }) => entry);
}
