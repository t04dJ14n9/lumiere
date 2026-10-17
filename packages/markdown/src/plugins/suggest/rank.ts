import { preparedFuzzyScore } from "../../shared/fuzzy";
import type { Candidate } from "./candidates";
interface Ranked {
  entry: Candidate;
  score: number;
}
function compare(a: Ranked, b: Ranked): number {
  return (
    b.score - a.score ||
    a.entry.label.length - b.entry.label.length ||
    a.entry.label.localeCompare(b.entry.label) ||
    a.entry.order.localeCompare(b.entry.order)
  );
}
/** Keep only the best 50; sorting the whole vault costs time but cannot affect the popup. */
export function rankedCandidates(
  entries: readonly Candidate[],
  query: string,
): Candidate[] {
  const best: Ranked[] = [];
  for (const entry of entries) {
    const name = preparedFuzzyScore(query, entry.labelText);
    const detail = preparedFuzzyScore(query, entry.detailText);
    if (name === undefined && detail === undefined) {
      continue;
    }
    const value = {
      entry,
      score: Math.max(name ?? -Infinity, detail ?? -Infinity),
    };
    if (best.length === 50 && compare(value, best[49]!) >= 0) {
      continue;
    }
    let from = 0;
    let to = best.length;
    while (from < to) {
      const middle = (from + to) >>> 1;
      if (compare(value, best[middle]!) < 0) {
        to = middle;
      } else {
        from = middle + 1;
      }
    }
    best.splice(from, 0, value);
    if (best.length > 50) {
      best.pop();
    }
  }
  return best.map(({ entry }) => entry);
}
