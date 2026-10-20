/**
 * CodeMirror sizes a block widget from `estimatedHeight` until it measures
 * the widget, and again when a rebuilt decoration sits outside the viewport.
 * The default, -1, is one line. Callouts, embeds, diagrams and block math all
 * share `MarkdownBlock`, so a tall callout that rebuilds off-screen collapses
 * the height map the same way tall Properties / tables do.
 *
 * Use source line count × default editor line height. Slight over-estimate is
 * safer than under-estimate (blank body / black PageDown).
 *
 * Mermaid fences are special: a short source can render a tall SVG (hundreds
 * of px). Plain line×24 under-reserves; use a taller per-line factor and a
 * floor so remounts keep scroll/PageDown valid until measure.
 *
 * Display math (`$$…$$`) is the same shape: a one-line matrix or stacked
 * fraction typesets far taller than its source. Count `\\` rows inside the
 * formula as well as source lines, with a floor so remounts stay honest.
 */
const LINE = 24;
const CHROME = 12;
/** Mermaid node/edge layouts are much taller than source text lines. */
const MERMAID_LINE = 72;
const MERMAID_MIN = 320;
/** MathJax SVG row height for matrices / align / stacked fractions. */
const MATH_LINE = 48;
const MATH_MIN = 160;

function isMermaidFence(source: string): boolean {
  const first = source.split("\n", 1)[0] ?? "";
  return /^[`~]{3,}\s*mermaid\b/i.test(first);
}

function isDisplayMath(source: string): boolean {
  return /^\${2}/.test(source.trimStart());
}

/** TeX row breaks (`\\`) plus source lines — matrices often sit on one line. */
function mathRows(source: string): number {
  const trimmed = source.trim();
  const body = trimmed.replace(/^\${2}/, "").replace(/\${2}$/, "");
  const texRows = (body.match(/\\\\/g) ?? []).length + 1;
  const sourceLines = Math.max(1, source.split("\n").length);
  return Math.max(sourceLines, texRows);
}

/** Reserve rendered-block height from Markdown source before DOM measure. */
export function markdownBlockEstimatedHeight(source: string): number {
  if (!source) {
    return LINE + CHROME;
  }
  const lines = Math.max(1, source.split("\n").length);
  if (isMermaidFence(source)) {
    return Math.max(MERMAID_MIN, CHROME + lines * MERMAID_LINE);
  }
  if (isDisplayMath(source)) {
    return Math.max(MATH_MIN, CHROME + mathRows(source) * MATH_LINE);
  }
  return CHROME + lines * LINE;
}
