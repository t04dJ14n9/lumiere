/** Independent implementation of the scoring formula documented in the Obsidian study §8. */
export interface FuzzyMatch {
  score: number;
  matches: readonly [number, number][];
}
export function queryTokens(query: string): string[] {
  const tokens: string[] = [];
  let word = "";
  const flush = () => {
    if (word) {
      tokens.push(word);
    }
    word = "";
  };
  for (const character of query.normalize("NFKC").toLowerCase()) {
    if (
      /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(
        character,
      )
    ) {
      flush();
      tokens.push(character);
    } else if (/[\p{L}\p{N}]/u.test(character)) {
      word += character;
    } else {
      flush();
    }
  }
  flush();
  return tokens;
}
export function fuzzyMatch(
  query: string,
  text: string,
): FuzzyMatch | undefined {
  const tokens = queryTokens(query);
  if (!tokens.length) {
    return { score: 0, matches: [] };
  }
  const { lower, original } = normalizeText(text);
  const positions =
    matchTokens(tokens, lower) ?? matchSubsequence(tokens, lower);
  if (!positions) {
    return undefined;
  }
  positions.sort((a, b) => a - b);
  const matches = contiguousRanges(positions);
  const boundaries = matches.filter(
    ([from]) => from > 0 && /[\p{L}\p{N}]/u.test(lower[from - 1]!),
  ).length;
  const spread = positions.at(-1)! - positions[0]! + 1;
  return {
    score:
      -(matches.length - 1) -
      boundaries / 10 -
      spread / 100 -
      positions[0]! / 1000 -
      lower.length / 10000,
    matches: sourceRanges(matches, original),
  };
}
interface SourceRange {
  from: number;
  to: number;
}

function normalizeText(text: string): {
  lower: string;
  original: SourceRange[];
} {
  let lower = "";
  const original: { from: number; to: number }[] = [];
  for (const part of new Intl.Segmenter(undefined, {
    granularity: "grapheme",
  }).segment(text)) {
    const normalized = part.segment.normalize("NFKC").toLowerCase();
    lower += normalized;
    for (let i = 0; i < normalized.length; i++) {
      original.push({ from: part.index, to: part.index + part.segment.length });
    }
  }
  return { lower, original };
}

/** Whole tokens may match out of order, but never reuse a character. */
function matchTokens(tokens: string[], lower: string): number[] | undefined {
  const used = new Set<number>();
  const positions: number[] = [];
  for (const token of tokens) {
    let at = lower.indexOf(token);
    while (
      at >= 0 &&
      Array.from({ length: token.length }, (_, i) => at + i).some((i) =>
        used.has(i),
      )
    ) {
      at = lower.indexOf(token, at + 1);
    }
    if (at < 0) {
      return undefined;
    }
    for (let i = at; i < at + token.length; i++) {
      used.add(i);
      positions.push(i);
    }
  }
  return positions;
}

function matchSubsequence(
  tokens: string[],
  lower: string,
): number[] | undefined {
  const positions: number[] = [];
  let at = 0;
  for (const char of tokens.join("")) {
    const found = lower.indexOf(char, at);
    if (found < 0) {
      return undefined;
    }
    for (let i = 0; i < char.length; i++) {
      positions.push(found + i);
    }
    at = found + char.length;
  }
  return positions;
}

function contiguousRanges(positions: number[]): [number, number][] {
  const matches: [number, number][] = [];
  for (const pos of positions) {
    const previous = matches.at(-1);
    if (previous?.[1] === pos) {
      previous[1]++;
    } else {
      matches.push([pos, pos + 1]);
    }
  }
  return matches;
}

/** Normalization can expand one grapheme into several UTF-16 positions. */
function sourceRanges(
  matches: [number, number][],
  original: SourceRange[],
): [number, number][] {
  const sourceMatches: [number, number][] = [];
  for (const [from, to] of matches) {
    const start = original[from]!.from;
    const end = original[to - 1]!.to;
    const previous = sourceMatches.at(-1);
    if (previous && start <= previous[1]) {
      previous[1] = Math.max(previous[1], end);
    } else {
      sourceMatches.push([start, end]);
    }
  }
  return sourceMatches;
}

export function matchScore(
  query: string,
  name: string,
  path: string,
): number | undefined {
  const scores = [
    fuzzyMatch(query, name)?.score,
    fuzzyMatch(query, path)?.score,
  ].filter((v): v is number => v !== undefined);
  return scores.length ? Math.max(...scores) : undefined;
}
