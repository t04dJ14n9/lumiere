import { preparedFuzzyScore } from "../../shared/fuzzy";
import type { Candidate } from "./candidates";
interface Ranked {
  entry: Candidate;
  /** Whether the query matched the label (a note's name), not only its path. */
  named: boolean;
  score: number;
}
function compare(a: Ranked, b: Ranked): number {
  // As in Obsidian, a note matched by its name comes before one matched only
  // through its folder.
  return (
    Number(b.named) - Number(a.named) ||
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
  // Nothing typed: the entries in their own order (a note's headings in
  // document order), as Obsidian lists them.
  if (!query) {
    return entries.slice(0, 50);
  }
  const best: Ranked[] = [];
  for (const entry of entries) {
    const name = preparedFuzzyScore(query, entry.labelText);
    const other =
      entry.matchText === undefined
        ? undefined
        : preparedFuzzyScore(query, entry.matchText);
    if (name === undefined && other === undefined) {
      continue;
    }
    const value = {
      entry,
      named: name !== undefined,
      score: name ?? other!,
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
