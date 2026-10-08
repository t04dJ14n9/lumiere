import type { RenderPass, Fence } from "../render/api";
import type { QueryClient, SearchUpdate } from "./client";
/** Each rendered block owns one subscription, including manual refresh and teardown. */
export function bindSearchBlock(
  fence: Fence,
  pass: RenderPass,
  client: QueryClient,
  source: string,
): () => void {
  const document = fence.element.ownerDocument;
  const header = document.createElement("div");
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
      renderResults({ status, results }, update);
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
): void {
  const { status, results } = elements;
  results.replaceChildren();
  if (update.loading) {
    status.textContent = "Searching…";
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
  status.textContent = `${matches.length} results${unreadable}`;
  for (const result of matches) {
    const item = results.ownerDocument.createElement("li");
    const link = results.ownerDocument.createElement("a");
    link.href = result.href;
    link.textContent = result.path;
    item.append(link);
    results.append(item);
  }
}
