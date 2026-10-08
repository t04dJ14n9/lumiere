/** Independent implementation of the scoring formula documented in the Obsidian study §8. */
export interface FuzzyMatch {
  score: number;
  matches: readonly [number, number][];
}
export function queryTokens(query: string): string[] {
  return (
    query
      .normalize("NFKC")
      .toLowerCase()
      .match(
        /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[\p{L}\p{N}]+/gu,
      ) ?? []
  );
}
export function fuzzyMatch(query: string, text: string): FuzzyMatch | undefined {
  const tokens = queryTokens(query);
  if (!tokens.length) return { score: 0, matches: [] };
  const lower = text.normalize("NFKC").toLowerCase(),
    used = new Set<number>();
  let positions: number[] = [];
  for (const token of tokens) {
    let at = lower.indexOf(token);
    while (
      at >= 0 &&
      Array.from({ length: token.length }, (_, i) => at + i).some((i) => used.has(i))
    )
      at = lower.indexOf(token, at + 1);
    if (at < 0) {
      positions = [];
      break;
    }
    for (let i = at; i < at + token.length; i++) {
      used.add(i);
      positions.push(i);
    }
  }
  if (!positions.length) {
    let at = 0;
    for (const char of tokens.join("")) {
      const found = lower.indexOf(char, at);
      if (found < 0) return undefined;
      for (let i = 0; i < char.length; i++) positions.push(found + i);
      at = found + char.length;
    }
  }
  positions.sort((a, b) => a - b);
  const matches: [number, number][] = [];
  for (const pos of positions) {
    const previous = matches.at(-1);
    if (previous?.[1] === pos) previous[1]++;
    else matches.push([pos, pos + 1]);
  }
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
    matches,
  };
}
export function matchScore(query: string, name: string, path: string): number | undefined {
  const scores = [fuzzyMatch(query, name)?.score, fuzzyMatch(query, path)?.score].filter(
    (v): v is number => v !== undefined,
  );
  return scores.length ? Math.max(...scores) : undefined;
}
