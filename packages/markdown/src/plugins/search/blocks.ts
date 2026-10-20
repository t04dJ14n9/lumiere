import type { RenderPass, Fence } from "../render/api";
import type { QueryClient, SearchUpdate } from "./client";
import type { SearchResponse } from "./protocol";

/** Open a vault path from a search result (match line carries an offset). */
export type OpenSearchResult = (target: {
  path: string;
  offset?: number;
  side?: boolean;
}) => void;

/** Each rendered block owns one subscription, including manual refresh and teardown. */
export function bindSearchBlock(
  fence: Fence,
  pass: RenderPass,
  client: QueryClient,
  source: string,
  open?: OpenSearchResult,
): () => void {
  const document = fence.element.ownerDocument;
  fence.element.classList.add("embedded-search");
  const header = document.createElement("div");
  header.className = "search-header";
  const code = document.createElement("code");
  code.textContent = fence.source.trim();
  const refresh = document.createElement("button");
  refresh.type = "button";
  refresh.textContent = "Refresh";
  refresh.setAttribute("aria-label", "Refresh search results");
  header.append(code, refresh);
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  const results = document.createElement("ul");
  results.setAttribute("aria-label", "Search results");
  fence.element.replaceChildren(header, status, results);
  let stop: (() => void) | undefined;
  let live = true;
  const start = () => {
    stop?.();
    stop = client.watch(fence.source, source, (update) => {
      if (!live) {
        return;
      }
      renderResults({ status, results }, update, open);
      pass.measure();
    });
  };
  refresh.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    start();
  };
  start();
  return () => {
    live = false;
    stop?.();
    refresh.onclick = null;
    refresh.disabled = true;
  };
}
function renderResults(
  elements: { status: HTMLElement; results: HTMLElement },
  update: SearchUpdate,
  open?: OpenSearchResult,
): void {
  const { status, results } = elements;
  results.replaceChildren();
  if (update.loading) {
    const matches = update.results ?? [];
    if (matches.length === 0) {
      status.textContent = "Searching…";
      return;
    }
    const unreadable = update.unreadable
      ? ` · ${update.unreadable} files could not be searched`
      : "";
    status.textContent = `Searching… ${matches.length} so far${unreadable}`;
    paintMatches(results, matches, open);
    return;
  }
  if (update.error) {
    status.textContent = `Search failed: ${update.error}`;
    return;
  }
  const matches = update.results ?? [];
  const unreadable = update.unreadable
    ? ` · ${update.unreadable} files could not be searched`
    : "";
  status.textContent = `${matches.length} ${matches.length === 1 ? "result" : "results"}${unreadable}`;
  paintMatches(results, matches, open);
}
function paintMatches(
  results: HTMLElement,
  matches: SearchResponse["results"],
  open?: OpenSearchResult,
): void {
  const doc = results.ownerDocument;
  for (const result of matches) {
    const item = doc.createElement("li");
    item.className = "search-result-file-title";
    const link = doc.createElement("a");
    link.href = result.href;
    link.textContent = result.path;
    item.append(link);
    const lines = result.matches ?? [];
    if (lines.length > 0) {
      const nest = doc.createElement("div");
      nest.className = "search-result-file-matches";
      for (const line of lines) {
        const row = doc.createElement("div");
        row.className = "search-result-file-match";
        row.setAttribute("data-offset", String(line.offset));
        row.setAttribute("role", "button");
        row.tabIndex = 0;
        row.setAttribute("aria-label", `Open ${result.path} at match`);
        paintMatchText(row, line);
        if (open) {
          const go = (event: MouseEvent | KeyboardEvent) => {
            event.preventDefault();
            event.stopPropagation();
            const side =
              "metaKey" in event &&
              (event.metaKey || event.ctrlKey) &&
              event.altKey;
            open({
              path: result.path,
              offset: line.offset,
              ...(side ? { side: true } : {}),
            });
          };
          row.onclick = go;
          row.onkeydown = (event) => {
            if (event.key === "Enter" || event.key === " ") {
              go(event);
            }
          };
        }
        nest.append(row);
      }
      item.append(nest);
    }
    results.append(item);
  }
}
function paintMatchText(
  row: HTMLElement,
  line: NonNullable<SearchResponse["results"][number]["matches"]>[number],
): void {
  const mark = line.mark;
  if (
    !mark ||
    mark.from < 0 ||
    mark.to <= mark.from ||
    mark.to > line.text.length
  ) {
    row.textContent = line.text;
    return;
  }
  const doc = row.ownerDocument;
  if (mark.from > 0) {
    row.append(doc.createTextNode(line.text.slice(0, mark.from)));
  }
  const span = doc.createElement("span");
  span.className = "search-result-file-matched-text";
  span.textContent = line.text.slice(mark.from, mark.to);
  row.append(span);
  if (mark.to < line.text.length) {
    row.append(doc.createTextNode(line.text.slice(mark.to)));
  }
}

/** Test helper: paint results into a detached list. */
export function paintSearchMatchesForTest(
  results: HTMLElement,
  matches: SearchResponse["results"],
  open?: OpenSearchResult,
): void {
  paintMatches(results, matches, open);
}
