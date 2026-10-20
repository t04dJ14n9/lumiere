import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
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
 * painted box. Attribute/`px` heights are exact; `vh`/`em`/`%` (and
 * `height="N%"`) use a stable viewport/font fallback.
 *
 * Wrapping callouts (and other MarkdownBlocks) can paint far taller than
 * line×24 on a narrow pane. Count ceil(chars / charsPerLine) per line so
 * first paint off-viewport (no ResizeObserver sample yet) still reserves
 * near the eventual measured height. charsPerLine comes from the live
 * `.cm-content` width when known; otherwise a 40-char fallback. After
 * measure, remember painted height so remounts do not fall back to the
 * formula and jump the map.
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
 * Fallback pane height for `vh` / `%` CSS and `height="N%"`. Matches the
 * constrained remount harness scroller and a typical note webview; measure +
 * cache corrects.
 */
const VIEWPORT_FALLBACK = 640;
/** Fallback font size for `em` CSS heights in HTML blocks. */
const FONT_FALLBACK = 16;
/** Fallback when no editor has reported content width yet (~480px pane). */
const FALLBACK_CHARS_PER_LINE = 40;
/** Floor so ultra-narrow panes still wrap aggressively. */
const MIN_CHARS_PER_LINE = 12;
/**
 * Average glyph width for Latin prose in the editor font. Slightly high so
 * charsPerLine undershoots and we prefer over-reserve on the border cases.
 */
const AVG_CHAR_PX = 9;
/** Callout/content horizontal chrome inside `.cm-content`. */
const CONTENT_PAD_PX = 24;

let estimateContentWidthPx = 0;

/** Remember live content width for wrap-aware first-paint estimates. */
export function rememberMarkdownBlockContentWidth(widthPx: number): void {
  if (widthPx > 0) {
    estimateContentWidthPx = widthPx;
  }
}

/** Test helper: reset to the fixed-40 fallback. */
export function clearMarkdownBlockContentWidth(): void {
  estimateContentWidthPx = 0;
}

/** Chars that fit one visual row at the last known content width. */
export function charsPerLineForEstimate(): number {
  if (estimateContentWidthPx <= 0) {
    return FALLBACK_CHARS_PER_LINE;
  }
  const usable = Math.max(1, estimateContentWidthPx - CONTENT_PAD_PX);
  return Math.max(MIN_CHARS_PER_LINE, Math.round(usable / AVG_CHAR_PX));
}

/**
 * Keep `estimateContentWidthPx` in sync so off-viewport widgets (no toDOM yet)
 * still wrap-estimate from the live pane width.
 */
export const markdownBlockWidthTracker = ViewPlugin.fromClass(
  class {
    constructor(view: EditorView) {
      rememberMarkdownBlockContentWidth(view.contentDOM.clientWidth);
    }
    update(update: ViewUpdate) {
      if (update.geometryChanged || update.docChanged) {
        rememberMarkdownBlockContentWidth(update.view.contentDOM.clientWidth);
      }
    }
  },
);

/** Painted heights for MarkdownBlock widgets, keyed by source. */
const measuredBlockHeights = new Map<string, number>();

/** Remember a block's painted height for the next off-viewport remount. */
export function rememberMarkdownBlockHeight(
  source: string,
  height: number,
): void {
  if (!source || !(height > 0)) {
    return;
  }
  const previous = measuredBlockHeights.get(source) ?? 0;
  if (height > previous) {
    measuredBlockHeights.set(source, height);
  }
}

/** Test helper: drop remembered MarkdownBlock heights. */
export function clearMarkdownBlockHeights(): void {
  measuredBlockHeights.clear();
}

/**
 * HTML-block alias used by HTML CSS remount tests (#131). Same cache as
 * `rememberMarkdownBlockHeight`, but ignores non-HTML sources.
 */
export function rememberHtmlBlockHeight(source: string, height: number): void {
  if (!/^\s*</.test(source)) {
    return;
  }
  rememberMarkdownBlockHeight(source, height);
}

/** Test helper: drop remembered heights (HTML remount suite). */
export function clearHtmlBlockHeights(): void {
  clearMarkdownBlockHeights();
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
 * Visual rows after soft-wrap. Strip leading `>` markers so quote chrome does
 * not inflate the character count; empty lines still reserve one row.
 */
export function wrappedVisualRows(
  source: string,
  charsPerLine: number = charsPerLineForEstimate(),
): number {
  const cpl = Math.max(1, charsPerLine);
  let rows = 0;
  for (const line of source.split("\n")) {
    const text = line.replace(/^(?:>\s*)+/u, "");
    const len = Math.max(1, text.length);
    rows += Math.max(1, Math.ceil(len / cpl));
  }
  return Math.max(1, rows);
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
  // Prefer unit-aware attrs: height="100%" is not 100 CSS pixels.
  for (const match of source.matchAll(
    /\bheight\s*=\s*["']?(\d+(?:\.\d+)?)(%|px)?/gi,
  )) {
    const value = Number(match[1]);
    const unit = (match[2] ?? "px").toLowerCase();
    attributed += unit === "%" ? (value / 100) * VIEWPORT_FALLBACK : value;
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

function formulaHeight(source: string): number {
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
    return Math.max(LINE + CHROME, html, CHROME + lines * LINE);
  }
  const wrapped = CHROME + wrappedVisualRows(source) * LINE;
  if (isCallout(source)) {
    // Keep callout chrome floor (#128) and lift further when lines wrap (#133).
    return Math.max(CALLOUT_CHROME + lines * CALLOUT_LINE, wrapped);
  }
  return wrapped;
}

/** Reserve rendered-block height from Markdown source before DOM measure. */
export function markdownBlockEstimatedHeight(source: string): number {
  const floor = formulaHeight(source);
  const cached = measuredBlockHeights.get(source);
  return cached === undefined ? floor : Math.max(floor, cached);
}
