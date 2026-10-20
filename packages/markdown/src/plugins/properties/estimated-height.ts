import { renderProperties } from "./sheet-html";
import type { PropertyTypes } from "../../markdown/properties/types";

/**
 * CodeMirror sizes a block widget from `estimatedHeight` until it measures
 * the widget, and again when a rebuilt decoration sits outside the viewport.
 * The default, -1, is one line. A properties sheet replaces the whole
 * frontmatter, so that one-line reserve shifts every coordinate below the
 * sheet by about the sheet's real height.
 *
 * The numbers are the default 16px sheet in `properties.css` (row min
 * height plus its padding, heading, add button, source articles). Once the
 * sheet is drawn, measurement replaces this guess.
 */
const TEXT = 16;
const LINE = TEXT * 1.5;
const ROW_PADDING = 4;
const VALUE_MIN = TEXT * 1.75;
const ROW = ROW_PADDING + VALUE_MIN;
const HEADING = TEXT * 0.875 * 1.5 + 8;
const ADD_BUTTON = 8 + 8 + LINE;
const SHEET_PADDING = 4 + 16;
const SHEET_CHROME = SHEET_PADDING + HEADING + ADD_BUTTON;
const COLLAPSED = SHEET_PADDING + TEXT * 0.875 * 1.5 + 8;
const ARTICLE_CHROME = 12 + 1;
const STACK_GAP = 8;
const COMPLEX_GAP = 8;
/** `textarea` rows=3 at 0.92em, plus its padding and border. */
const YAML_FIELD = 76;

export function propertiesEstimatedHeight(input: {
  source: string;
  hidden: boolean;
  collapsed: boolean;
  allowEmpty: boolean;
  types?: PropertyTypes;
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
    ...(input.renderValue ? { renderValue: input.renderValue } : {}),
  });
  return markupHeight(markup);
}

function markupHeight(markup: string): number {
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
  return height;
}

function propertyRowHeight(row: string): number {
  return Math.max(ROW, ROW_PADDING + valueColumnHeight(row));
}

function valueColumnHeight(row: string): number {
  const sources = sourcesHeight(row);
  if (sources > 0) {
    return sources + COMPLEX_GAP + YAML_FIELD;
  }
  if (row.includes("metadata-input-yaml")) {
    return YAML_FIELD;
  }
  return longTextHeight(row);
}

function longTextHeight(row: string): number {
  const field =
    /<div ([^>]*metadata-input-longtext[^>]*)>([\s\S]*?)<\/div>/.exec(row);
  const tag = field?.[1];
  const text = field?.[2];
  if (!tag || text === undefined || tag.includes("hidden")) {
    return VALUE_MIN;
  }
  return Math.max(VALUE_MIN, text.split("\n").length * LINE);
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
  const paragraphs = occurrences(article, "<p");
  let height = ARTICLE_CHROME + paragraphs * LINE;
  if (paragraphs > 1) {
    height += paragraphs * 2;
  }
  const raw = /<pre class="source-raw">([\s\S]*?)<\/pre>/.exec(article)?.[1];
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

function occurrences(text: string, needle: string): number {
  let count = 0;
  let from = 0;
  while (from < text.length) {
    const at = text.indexOf(needle, from);
    if (at < 0) {
      return count;
    }
    count += 1;
    from = at + needle.length;
  }
  return count;
}
