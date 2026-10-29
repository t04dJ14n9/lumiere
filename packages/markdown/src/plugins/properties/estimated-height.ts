import { renderProperties } from "./sheet-html";
import type { PropertyTypes } from "../../markdown/properties/types";

/**
 * CodeMirror sizes a block widget from `estimatedHeight` until it measures
 * the widget, and again when a rebuilt decoration sits outside the viewport.
 * The default, -1, is one line. A properties sheet replaces the whole
 * frontmatter, so that one-line reserve shifts every coordinate below the
 * sheet by about the sheet's real height.
 *
 * Wrapping longtext values count visual rows (pre-wrap), capped at
 * Obsidian's unfocused 3-line clamp — same class of bug as wrapping
 * tag chips when the reserve is too short.
 *
 * The numbers match the Obsidian-parity sheet in `properties.css`:
 * 0.875em metadata text (~14px at 16px root), 8px top padding,
 * 2rem bottom margin, 3px row gap, heading, add button, source articles.
 * Once the sheet is drawn, measurement replaces this guess.
 */
const TEXT = 14;
const LINE = TEXT * 1.5;
const ROW_PADDING = 0;
const ROW_GAP = 3;
/**
 * Obsidian input pad 4px 8px on border-box min-height 1.75em: line box + pad
 * exceeds 1.75em (~+4px), so remount reserve must include that growth.
 */
const VALUE_MIN = TEXT * 1.75 + 4;
const ROW = ROW_PADDING + VALUE_MIN;
const HEADING = TEXT * 1.5 + 8;
const ADD_BUTTON = 8 + 8 + LINE;
const SHEET_PADDING = 8 + 32;
const SHEET_CHROME = SHEET_PADDING + HEADING + ADD_BUTTON;
const COLLAPSED = SHEET_PADDING + HEADING;
/** `.source-row` padding 6+6 plus 1px border-top (`properties.css`). */
const ARTICLE_CHROME = 12 + 1;
/** Non-title `<p>` use `margin: 2px 0` → 4px; `.source-title` is `margin: 0`. */
const ARTICLE_META_MARGIN = 4;
const STACK_GAP = 8;
/** `textarea` rows=3 at 0.92em of the 0.875em sheet, plus padding/border. */
const YAML_FIELD = 76;
/** Flex-wrap chips in the value column (default ~14px sheet width). */
const LIST_WIDTH = 340;
const CHIP_GAP = 6;
/** Border + content/remove --pill-padding-x + × button (Obsidian multi-select-pill). */
const CHIP_CHROME = 36;
const CHAR_WIDTH = TEXT * 0.55;
const CHIP_ROW = LINE;

export function propertiesEstimatedHeight(input: {
  source: string;
  hidden: boolean;
  collapsed: boolean;
  allowEmpty: boolean;
  types?: PropertyTypes;
  listPreviewCount?: number;
  expandedLists?: ReadonlySet<string>;
  renderValue?(
    key: string,
    value: unknown,
    values: Record<string, unknown>,
  ): string | undefined;
}): number {
  if (input.hidden) {
    return 0;
  }
  const markup = renderProperties(input.source, input.types ?? {}, {
    collapsed: input.collapsed,
    allowEmpty: input.allowEmpty,
    ...(input.listPreviewCount !== undefined
      ? { listPreviewCount: input.listPreviewCount }
      : {}),
    ...(input.expandedLists ? { expandedLists: input.expandedLists } : {}),
    ...(input.renderValue ? { renderValue: input.renderValue } : {}),
  });
  return propertiesHeightFromMarkup(markup);
}

/** Height from already-built sheet markup (avoids a second renderProperties). */
export function propertiesHeightFromMarkup(markup: string): number {
  if (markup.length === 0) {
    return 0;
  }
  if (markup.includes('class="render-error"')) {
    return errorSheetHeight(markup);
  }
  if (markup.includes(" is-collapsed")) {
    return COLLAPSED;
  }
  const rows = markup.split('<div class="property-row').slice(1);
  let height = SHEET_CHROME;
  for (const row of rows) {
    height += propertyRowHeight(row);
  }
  if (rows.length > 1) {
    height += (rows.length - 1) * ROW_GAP;
  }
  return height;
}

function propertyRowHeight(row: string): number {
  return Math.max(ROW, ROW_PADDING + valueColumnHeight(row));
}

function valueColumnHeight(row: string): number {
  const sources = sourcesHeight(row);
  // Sources stacked UI is typed OKF — no YAML draft under the rows.
  if (sources > 0) {
    return sources;
  }
  // Unknown JSON / OKF provenance chips are one value line.
  if (row.includes("mod-unknown") || row.includes("mod-okf-provenance")) {
    return VALUE_MIN;
  }
  if (
    row.includes("metadata-input-yaml") &&
    !row.includes(
      '<textarea hidden class="metadata-input-longtext metadata-input-yaml"',
    )
  ) {
    return YAML_FIELD;
  }
  const list = listHeight(row);
  if (list !== undefined) {
    return list;
  }
  return longTextHeight(row);
}

/** Tag/alias/list chips wrap; one-row reserve blanks the body like Sources did. */
function listHeight(row: string): number | undefined {
  if (!row.includes("multi-select-container")) {
    return undefined;
  }
  // Visible chips only — extras stay in markup with `hidden`.
  const labels: string[] = [];
  for (const chip of row.split('<span class="property-chip').slice(1)) {
    if (/^[^>]*\bhidden\b/.test(chip)) {
      continue;
    }
    const content = /multi-select-pill-content">([\s\S]*?)<\/span>/.exec(chip);
    if (content) {
      labels.push(content[1]!.replace(/<[^>]+>/g, "").trim());
    }
  }
  if (labels.length === 0) {
    return VALUE_MIN;
  }
  let x = 0;
  let rows = 1;
  for (const label of labels) {
    const width = CHIP_CHROME + Math.max(label.length, 1) * CHAR_WIDTH;
    if (x > 0 && x + width > LIST_WIDTH) {
      rows += 1;
      x = 0;
    }
    x += width + CHIP_GAP;
  }
  return Math.max(VALUE_MIN, rows * CHIP_ROW);
}

/**
 * Longtext uses pre-wrap + overflow-wrap:anywhere. Obsidian clamps unfocused
 * text to 3 lines (`--metadata-input-longtext-lines`); the estimate matches
 * that unfocused paint so remounts do not reserve a full unclamped essay.
 */
const LONGTEXT_CLAMP_LINES = 3;

function longTextHeight(row: string): number {
  const field =
    /<div ([^>]*metadata-input-longtext[^>]*)>([\s\S]*?)<\/div>/.exec(row);
  const tag = field?.[1];
  const text = field?.[2];
  if (!tag || text === undefined || tag.includes("hidden")) {
    return VALUE_MIN;
  }
  const plain = text.replace(/<[^>]+>/g, "");
  let rows = 0;
  for (const line of plain.split("\n")) {
    const width = Math.max(line.length, 1) * CHAR_WIDTH;
    rows += Math.max(1, Math.ceil(width / LIST_WIDTH));
  }
  return Math.max(VALUE_MIN, Math.min(rows, LONGTEXT_CLAMP_LINES) * LINE);
}

/** Visible source articles only. Rows past the disclosure stay in the markup with `hidden`. */
function sourcesHeight(row: string): number {
  if (!row.includes("source-row")) {
    return 0;
  }
  const articles = row.split("<article").slice(1);
  let height = 0;
  let visible = 0;
  for (const article of articles) {
    if (article.startsWith(' class="source-row" hidden')) {
      continue;
    }
    visible += 1;
    height += sourceArticleHeight(article);
  }
  if (visible === 0) {
    return 0;
  }
  height += (visible - 1) * STACK_GAP;
  if (row.includes("data-source-more")) {
    height += STACK_GAP + LINE;
  }
  return height;
}

function sourceArticleHeight(article: string): number {
  // Titles and long resource URLs wrap in the value column (LIST_WIDTH).
  // One-line-per-<p> underestimates WorkVault Sources and leaves the map
  // short of painted height (tail overlap / Escape jump into the sheet).
  // Paragraph vertical margins follow properties.css: title has none; meta
  // lines (resource/id/usage/meta) contribute ARTICLE_META_MARGIN each so a
  // typical title+resource article still lands on the measured 65px floor.
  // Bound at </article>: the split remnant can include sheet chrome (SVG
  // icons, `.property-message`) that must not count as article paragraphs.
  const end = article.indexOf("</article>");
  const body = end === -1 ? article : article.slice(0, end);
  let height = ARTICLE_CHROME;
  for (const match of body.matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/g)) {
    const plain = match[1]!.replace(/<[^>]+>/g, "").trim();
    const width = Math.max(plain.length, 1) * CHAR_WIDTH;
    const rows = Math.max(1, Math.ceil(width / LIST_WIDTH));
    const className = /class="([^"]*)"/.exec(match[0]!)?.[1] ?? "";
    const margin = className.includes("source-title") ? 0 : ARTICLE_META_MARGIN;
    height += rows * LINE + margin;
  }
  const raw = /<pre class="source-raw">([\s\S]*?)<\/pre>/.exec(body)?.[1];
  if (raw === undefined) {
    return height;
  }
  return height + rawBlockHeight(raw);
}

function rawBlockHeight(text: string): number {
  return 4 + text.split("\n").length * TEXT * 0.85 * 1.5;
}

function errorSheetHeight(markup: string): number {
  const pre = /<pre>([\s\S]*?)<\/pre>/.exec(markup)?.[1];
  const lines = pre === undefined ? 1 : pre.split("\n").length;
  return LINE + lines * LINE;
}
