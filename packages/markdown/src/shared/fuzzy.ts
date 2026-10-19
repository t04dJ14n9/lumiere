/**
 * Fuzzy matching as Obsidian 1.14 matches its suggestions and quick switcher,
 * checked score for score against its public `prepareFuzzySearch`.
 *
 * The query's words are found in order, each after the last; failing that,
 * its letters are. A match is better when it is in fewer pieces, starts its
 * words (a letter matched inside a word costs, unless it follows the letter
 * before it), is tighter, starts earlier and is in a shorter text. Scores are
 * at most 0; higher wins.
 */
export interface FuzzyMatch {
  score: number;
  /** The matched ranges of the text, `[from, to)`, in order. */
  matches: readonly [number, number][];
}

const SPACE = /\s/u;
/** Punctuation: a word of its own in a query, and a word break in a text. */
const PUNCTUATION =
  /[\u2000-\u206F\u2E00-\u2E7F\\'!"#$%&()*+,\-./:;<=>?@[\]^_`{|}~]/u;
/** Han, kana and Tibetan, where each character is a word. */
const WIDE =
  /[\u0F00-\u0FFF\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF66-\uFF9F]/u;

interface PreparedQuery {
  query: string;
  /** Words, lower-cased; punctuation and wide characters are words alone. */
  words: string[];
  /** Every character but spaces, lower-cased. */
  letters: string[];
}

export function queryTokens(query: string): string[] {
  const lower = query.toLowerCase();
  const words: string[] = [];
  let start = 0;
  for (let at = 0; at < lower.length; at++) {
    const char = lower[at]!;
    const alone = PUNCTUATION.test(char) || WIDE.test(char);
    if (SPACE.test(char) || alone) {
      if (start !== at) {
        words.push(lower.slice(start, at));
      }
      if (alone) {
        words.push(char);
      }
      start = at + 1;
    }
  }
  if (start !== lower.length) {
    words.push(lower.slice(start));
  }
  return words;
}

// Callers score many texts against the same query, one call each.
let last: PreparedQuery | undefined;

function prepared(query: string): PreparedQuery {
  if (last?.query !== query) {
    last = {
      query,
      words: queryTokens(query),
      letters: query
        .toLowerCase()
        .split("")
        .filter((char) => char !== " "),
    };
  }
  return last;
}

/**
 * Whether the piece found at `at` starts inside a word: a small letter after
 * a letter or digit, or a capital after a capital. A capital after a small
 * letter starts a word (`camelCase`), and so does a digit.
 */
function startsInsideWord(text: string, at: number): boolean {
  const char = text[at]!;
  if (at === 0 || PUNCTUATION.test(char) || WIDE.test(char)) {
    return false;
  }
  const before = text[at - 1]!;
  const capital = char.toLowerCase() !== char;
  const small = char.toUpperCase() !== char;
  return (
    (capital && before.toLowerCase() !== before) ||
    (small &&
      !PUNCTUATION.test(before) &&
      !SPACE.test(before) &&
      !WIDE.test(before))
  );
}

/** Lower-cased with every position kept (a few letters lengthen otherwise). */
function lowerCased(text: string): string {
  const lower = text.toLowerCase();
  if (lower.length === text.length) {
    return lower;
  }
  return text.replace(/[\s\S]/gu, (char) => {
    const small = char.toLowerCase();
    return small.length === char.length ? small : char;
  });
}

function matchPieces(
  pieces: readonly string[],
  text: string,
  lower: string,
  letters: boolean,
): { ranges: [number, number][]; inside: number } | undefined {
  if (!pieces.length) {
    return undefined;
  }
  const ranges: [number, number][] = [];
  let from = 0;
  let inside = 0;
  for (const piece of pieces) {
    const at = lower.indexOf(piece, from);
    if (at < 0) {
      return undefined;
    }
    if (startsInsideWord(text, at) && !(letters && at === from)) {
      inside++;
    }
    const previous = ranges.at(-1);
    if (previous && previous[1] >= at) {
      previous[1] = at + piece.length;
    } else {
      ranges.push([at, at + piece.length]);
    }
    from = at + piece.length;
  }
  return { ranges, inside };
}

function rangesScore(
  ranges: readonly [number, number][],
  inside: number,
  queryLength: number,
  textLength: number,
): number {
  const first = ranges[0]![0];
  const end = ranges.at(-1)![1];
  return (
    -(ranges.length - 1) -
    inside / 10 -
    (end - first + 1 - queryLength) / 100 -
    first / 1000 -
    textLength / 10000
  );
}

export function fuzzyMatch(
  query: string,
  text: string,
): FuzzyMatch | undefined {
  if (query === "") {
    return { score: 0, matches: [] };
  }
  const { words, letters } = prepared(query);
  const lower = lowerCased(text);
  const found =
    matchPieces(words, text, lower, false) ??
    matchPieces(letters, text, lower, true);
  if (!found) {
    return undefined;
  }
  return {
    score: rangesScore(found.ranges, found.inside, query.length, lower.length),
    matches: found.ranges,
  };
}

export function fuzzyScore(query: string, text: string): number | undefined {
  return fuzzyMatch(query, text)?.score;
}
