/**
 * CodeMirror sizes a block widget from `estimatedHeight` until it measures
 * the widget, and again when a rebuilt decoration sits outside the viewport.
 * The default, -1, is one line (~24px).
 *
 * Embedded ` ```query ` fences are short (often 2–4 source lines) but render
 * a results list capped at 400px (`search.css`). Plain MarkdownBlock line×24
 * (#109) still under-reserves the same way short Mermaid fences do (#114).
 * Reserve a results-sized floor so off-viewport remounts keep scroll/PageDown
 * valid until measure runs again after results load.
 */
const LINE = 24;
const CHROME = 80; // header + status + padding around the results list
/** Matches `.embedded-search ul { max-height: 400px }` plus modest chrome. */
const QUERY_MIN = 360;

/** True when `source` is a fenced query block Live Preview replaces. */
export function isQueryFence(source: string): boolean {
  const first = source.split("\n", 1)[0] ?? "";
  return /^[`~]{3,}\s*query\b/i.test(first);
}

/** Reserve query-block height from Markdown source before DOM measure. */
export function queryEstimatedHeight(source: string): number {
  if (!source || !isQueryFence(source)) {
    return LINE + CHROME;
  }
  const lines = Math.max(1, source.split("\n").length);
  return Math.max(QUERY_MIN, CHROME + lines * LINE);
}
