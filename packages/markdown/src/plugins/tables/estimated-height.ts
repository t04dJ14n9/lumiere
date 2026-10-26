import { parseTable } from "../../markdown/tables/model";

/**
 * CodeMirror sizes a block widget from `estimatedHeight` until it measures
 * the widget, and again when a rebuilt decoration sits outside the viewport.
 * The default, -1, is one line. A table widget can be hundreds of pixels tall,
 * so that one-line reserve collapses the height map after an off-viewport
 * rebuild (scroll/PageDown then lands in empty mapped space).
 *
 * Numbers match the default sheet in `tables.css`: 16px font, 1.3 line-height,
 * 4px vertical cell padding, and the table wrapper's 16px top padding. Cell
 * markdown must not add paragraph margins (see tables.css) or this under-reserves.
 */
const TEXT = 16;
const LINE = TEXT * 1.3;
const CELL_PAD_Y = 4 + 4;
const ROW = CELL_PAD_Y + LINE;
const WRAPPER_TOP = 16;
/** Bottom add-strip / grip chrome kept small so short tables are not overshot. */
const CHROME = WRAPPER_TOP + 8;

const TABLE_HEIGHT_CACHE_LIMIT = 256;
const measuredTableHeights = new Map<string, number>();

/** Record the measured pixel height of a rendered table widget by source. */
export function rememberTableHeight(source: string, height: number): void {
  if (!source || !Number.isFinite(height) || height <= 0) {
    return;
  }
  const rounded = Math.round(height);
  if (measuredTableHeights.has(source)) {
    measuredTableHeights.delete(source);
  } else if (measuredTableHeights.size >= TABLE_HEIGHT_CACHE_LIMIT) {
    const oldest = measuredTableHeights.keys().next().value;
    if (oldest !== undefined) {
      measuredTableHeights.delete(oldest);
    }
  }
  measuredTableHeights.set(source, rounded);
}

/** Clear cached measured table heights (for tests). */
export function clearTableHeightCache(): void {
  measuredTableHeights.clear();
}

/** Reserve table height from the Markdown source before or after the DOM is measured. */
export function tableEstimatedHeight(source: string): number {
  const measured = measuredTableHeights.get(source);
  if (measured !== undefined) {
    measuredTableHeights.delete(source);
    measuredTableHeights.set(source, measured);
    return measured;
  }
  const model = parseTable(source);
  if (!model || model.rows.length === 0) {
    return ROW + CHROME;
  }
  // parseTable rows exclude the delimiter line; header + body match the grid.
  return CHROME + model.rows.length * ROW;
}
