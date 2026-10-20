/**
 * CodeMirror sizes a block widget from `estimatedHeight` until it measures
 * the widget, and again when a rebuilt decoration sits outside the viewport.
 * The default, -1, is one line. Callouts, embeds, diagrams and block math all
 * share `MarkdownBlock`, so a tall callout that rebuilds off-screen collapses
 * the height map the same way tall Properties / tables do.
 *
 * Use source line count × default editor line height. Slight over-estimate is
 * safer than under-estimate (blank body / black PageDown). Callouts get a
 * taller per-line factor plus title/padding chrome so remounts stay near the
 * painted box, not bare quote lines.
 *
 * Mermaid fences are special: a short source can render a tall SVG (hundreds
 * of px). Plain line×24 under-reserves; use a taller per-line factor and a
 * floor so remounts keep scroll/PageDown valid until measure. MarkdownBlock
 * also applies this reserve as minHeight so a remount that still sits in the
 * draw margin cannot measure the pre-SVG shell (~182) before Mermaid finishes.
 *
 * Display math (`$$…$$`) is the same shape: a one-line matrix or stacked
 * fraction typesets far taller than its source. Count `\\` rows inside the
 * formula as well as source lines, with a floor so remounts stay honest.
 *
 * Raw HTML blocks (`<img height>`, `<iframe>`, bare `<img>`, CSS `height`)
 * are another short-source / tall-paint case: line×24 under-reserves the
 * painted box. Attribute/`px` heights are exact; `vh`/`em`/`%` use a stable
 * viewport/font fallback. After measure, remember painted height so remounts
 * keep exotic CSS (and under-parsed units) honest.
 */
const LINE = 24;
const CHROME = 12;
/** Mermaid node/edge layouts are much taller than source text lines. */
const MERMAID_LINE = 72;
const MERMAID_MIN = 320;
/** MathJax SVG row height for matrices / align / stacked fractions. */
const MATH_LINE = 48;
const MATH_MIN = 160;
/** Bare <img>/<iframe>/<video> without an explicit height attribute. */
const HTML_MEDIA_DEFAULT = 240;
/**
 * Callout boxes add title row + padding beyond plain quote lines. line×24
 * under-reserves (~996 vs ~1530 measured for 40 body lines) so remounts
 * fail the 0.7× measured guard in callout-remount-height.
 */
const CALLOUT_LINE = 36;
const CALLOUT_CHROME = 40;
/**
 * Fallback pane height for `vh` / `%` CSS. Matches the constrained remount
 * harness scroller and a typical note webview; measure + cache corrects.
 */
const VIEWPORT_FALLBACK = 640;
/** Fallback font size for `em` CSS heights in HTML blocks. */
const FONT_FALLBACK = 16;

/** Painted heights for HTML blocks, keyed by Markdown source. */
const measuredHtmlHeights = new Map<string, number>();

/** Remember an HTML block's painted height for the next off-viewport remount. */
export function rememberHtmlBlockHeight(source: string, height: number): void {
  if (!/^\s*</.test(source) || !(height > 0)) {
    return;
  }
  const previous = measuredHtmlHeights.get(source) ?? 0;
  if (height > previous) {
    measuredHtmlHeights.set(source, height);
  }
}

/** Test helper: drop remembered HTML-block heights. */
export function clearHtmlBlockHeights(): void {
  measuredHtmlHeights.clear();
}

function isMermaidFence(source: string): boolean {
  const first = source.split("\n", 1)[0] ?? "";
  return /^[`~]{3,}\s*mermaid\b/i.test(first);
}

function isDisplayMath(source: string): boolean {
  return /^\${2}/.test(source.trimStart());
}

function isCallout(source: string): boolean {
  return /^>\s*\[!.+?\]/m.test(source.trimStart());
}

/** TeX row breaks (`\\`) plus source lines — matrices often sit on one line. */
function mathRows(source: string): number {
  const trimmed = source.trim();
  const body = trimmed.replace(/^\${2}/, "").replace(/\${2}$/, "");
  const texRows = (body.match(/\\\\/g) ?? []).length + 1;
  const sourceLines = Math.max(1, source.split("\n").length);
  return Math.max(sourceLines, texRows);
}

/**
 * Height from HTML media tags / CSS height in an HTMLBlock. Returns undefined
 * when the source is not HTML or has no media/height, so callers fall through
 * to line×24.
 */
function htmlMediaHeight(source: string): number | undefined {
  if (!/^\s*</.test(source)) {
    return undefined;
  }
  let attributed = 0;
  let attributedCount = 0;
  for (const match of source.matchAll(/\bheight\s*=\s*["']?(\d+)/gi)) {
    attributed += Number(match[1]);
    attributedCount += 1;
  }
  for (const match of source.matchAll(/height\s*:\s*(\d+(?:\.\d+)?)\s*px/gi)) {
    attributed += Number(match[1]);
    attributedCount += 1;
  }
  for (const match of source.matchAll(/height\s*:\s*(\d+(?:\.\d+)?)\s*vh/gi)) {
    attributed += (Number(match[1]) / 100) * VIEWPORT_FALLBACK;
    attributedCount += 1;
  }
  for (const match of source.matchAll(/height\s*:\s*(\d+(?:\.\d+)?)\s*%/gi)) {
    attributed += (Number(match[1]) / 100) * VIEWPORT_FALLBACK;
    attributedCount += 1;
  }
  for (const match of source.matchAll(/height\s*:\s*(\d+(?:\.\d+)?)\s*em/gi)) {
    attributed += Number(match[1]) * FONT_FALLBACK;
    attributedCount += 1;
  }
  const mediaTags = (
    source.match(/<(?:img|iframe|video|object|embed|svg)\b/gi) ?? []
  ).length;
  if (attributedCount === 0 && mediaTags === 0) {
    return undefined;
  }
  const unattributed = Math.max(0, mediaTags - attributedCount);
  return CHROME + attributed + unattributed * HTML_MEDIA_DEFAULT;
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
  const html = htmlMediaHeight(source);
  if (html !== undefined) {
    const floor = Math.max(LINE + CHROME, html, CHROME + lines * LINE);
    const cached = measuredHtmlHeights.get(source);
    return cached === undefined ? floor : Math.max(floor, cached);
  }
  // Non-media HTML can still paint tall via layout; use cache after measure.
  if (/^\s*</.test(source)) {
    const cached = measuredHtmlHeights.get(source);
    if (cached !== undefined) {
      return Math.max(CHROME + lines * LINE, cached);
    }
  }
  if (isCallout(source)) {
    return CALLOUT_CHROME + lines * CALLOUT_LINE;
  }
  return CHROME + lines * LINE;
}
