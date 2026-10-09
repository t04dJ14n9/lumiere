import type { EditorState } from "@codemirror/state";
import type { SearchQuery } from "@codemirror/search";

/** Counting stops here so a one-letter query in a huge note stays cheap. */
export const countLimit = 1000;

export interface MatchCount {
  /** 1-based index of the selected match, or 0 when no match is selected. */
  current: number;
  total: number;
  /** True when the note has more matches than were counted. */
  capped: boolean;
}

/** Counts `query`'s matches and finds which one the main selection is on. */
export function countMatches(
  state: EditorState,
  query: SearchQuery,
): MatchCount {
  const result = { current: 0, total: 0, capped: false };
  if (!query.valid) {
    return result;
  }
  const { from, to } = state.selection.main;
  const cursor = query.getCursor(state);
  for (let next = cursor.next(); !next.done; next = cursor.next()) {
    if (result.total === countLimit) {
      result.capped = true;
      break;
    }
    result.total += 1;
    if (next.value.from === from && next.value.to === to) {
      result.current = result.total;
    }
  }
  return result;
}

/** Text shown beside the find field, as in Obsidian's find bar. */
export function countLabel(query: SearchQuery, count: MatchCount): string {
  if (!query.search) {
    return "";
  }
  if (count.total === 0) {
    return "No results";
  }
  const total = count.capped ? `${countLimit}+` : String(count.total);
  return count.current ? `${count.current} / ${total}` : `${total} results`;
}
