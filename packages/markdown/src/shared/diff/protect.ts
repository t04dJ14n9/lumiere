/**
 * Syntax that is not text, for the word-diff highlighter: line prefixes
 * (quotes, list and task markers, heading marks), reference definitions,
 * link destinations, math, autolinks, HTML tags and wikilinks. (Code spans
 * are found by `codeSpans`.)
 *
 * One linear scan. Line-anchored patterns run once per line start (sticky,
 * bounded by the line); inline constructs find their closer through
 * precomputed next-occurrence tables, so no position is rescanned. An
 * unclosed opener protects nothing.
 */
const LINE_PREFIX =
  /[ \t]{0,3}(?:>[ \t]?)*(?:(?:[-+*]|\d{1,9}[.)])(?:[ \t]+\[[ xX]\])?(?=[ \t]|$|\n)|#{1,6}(?=[ \t]|$|\n))/y;
const REFERENCE_DEFINITION = /[ \t]{0,3}\[[^\]\n]+\]:[^\n]*/y;
const WORD = /[A-Za-z0-9_]/;
const SPACE = /\s/;

type Range = [number, number];

/** For each index, the next index at or after it holding `char` (or n). */
function nextOf(text: string, char: string): Int32Array {
  const n = text.length;
  const next = new Int32Array(n + 1).fill(n);
  const code = char.charCodeAt(0);
  for (let i = n - 1; i >= 0; i--) {
    next[i] = text.charCodeAt(i) === code ? i : next[i + 1]!;
  }
  return next;
}

interface Tables {
  readonly n: number;
  readonly newline: Int32Array;
  readonly paren: Int32Array;
  readonly angle: Int32Array;
  readonly bracket: Int32Array;
  readonly dollar: Int32Array;
}

function lineRanges(text: string, tables: Tables): Range[] {
  const ranges: Range[] = [];
  for (let start = 0; start <= tables.n; start = tables.newline[start]! + 1) {
    for (const pattern of [LINE_PREFIX, REFERENCE_DEFINITION]) {
      pattern.lastIndex = start;
      const match = pattern.exec(text);
      if (match && match[0].length > 0) {
        ranges.push([start, start + match[0].length]);
      }
    }
  }
  return ranges;
}

/** A closer from `table` on the same line, at or after `from`; else -1. */
function closer(tables: Tables, table: Int32Array, from: number): number {
  return from <= tables.n && table[from]! < tables.newline[from]!
    ? table[from]!
    : -1;
}

/** Where the inline construct opening at `i` ends (exclusive), or -1. */
function inlineEnd(text: string, i: number, tables: Tables): number {
  const ch = text[i];
  if (ch === "$") {
    const j = closer(tables, tables.dollar, i + 1);
    return j > i + 1 ? j + 1 : -1;
  }
  if (ch === "]" && text[i + 1] === "(") {
    const j = closer(tables, tables.paren, i + 2);
    return j >= 0 ? j + 1 : -1;
  }
  if (ch === "<") {
    const j = closer(tables, tables.angle, i + 1);
    return j >= 0 ? j + 1 : -1;
  }
  if (ch === "[" && text[i + 1] === "[") {
    const j = closer(tables, tables.bracket, i + 2);
    return j >= 0 && text[j + 1] === "]" ? j + 2 : -1;
  }
  return -1;
}

/** An autolink around the "://" at `i`: word scheme before, non-space after. */
function urlAt(text: string, i: number): Range | undefined {
  if (text[i] !== ":" || !text.startsWith("//", i + 1)) {
    return undefined;
  }
  let from = i;
  while (from > 0 && WORD.test(text[from - 1]!)) {
    from--;
  }
  if (from === i) {
    return undefined;
  }
  let to = i + 3;
  while (to < text.length && !SPACE.test(text[to]!)) {
    to++;
  }
  // As the old `\S+`: at least one character after "://".
  return to > i + 3 ? [from, to] : undefined;
}

export function protectedRanges(text: string): Range[] {
  const tables: Tables = {
    n: text.length,
    newline: nextOf(text, "\n"),
    paren: nextOf(text, ")"),
    angle: nextOf(text, ">"),
    bracket: nextOf(text, "]"),
    dollar: nextOf(text, "$"),
  };
  const ranges = lineRanges(text, tables);
  let i = 0;
  while (i < text.length) {
    const url = urlAt(text, i);
    const end = url ? url[1] : inlineEnd(text, i, tables);
    if (end > i) {
      ranges.push(url ?? [i, end]);
      i = end;
    } else {
      i++;
    }
  }
  return ranges;
}

/**
 * Whether [from, to) overlaps any range: ranges sorted by start with a
 * running maximum end, then a binary search, so each query is logarithmic.
 */
export function overlaps(ranges: readonly Range[]) {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const reach: number[] = [];
  let max = -1;
  for (const [, end] of sorted) {
    max = Math.max(max, end);
    reach.push(max);
  }
  return (from: number, to: number): boolean => {
    let lo = 0;
    let hi = sorted.length - 1;
    let last = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid]![0] < to) {
        last = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return last >= 0 && reach[last]! > from;
  };
}
