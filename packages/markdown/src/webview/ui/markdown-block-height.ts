/**
 * CodeMirror sizes a block widget from `estimatedHeight` until it measures
 * the widget, and again when a rebuilt decoration sits outside the viewport.
 * The default, -1, is one line. Callouts, embeds, diagrams and block math all
 * share `MarkdownBlock`, so a tall callout that rebuilds off-screen collapses
 * the height map the same way tall Properties / tables do.
 *
 * Use source line count × default editor line height. Slight over-estimate is
 * safer than under-estimate (blank body / black PageDown).
 */
const LINE = 24;
const CHROME = 12;

/** Reserve rendered-block height from Markdown source before DOM measure. */
export function markdownBlockEstimatedHeight(source: string): number {
  if (!source) {
    return LINE + CHROME;
  }
  const lines = source.split("\n").length;
  return CHROME + Math.max(1, lines) * LINE;
}
