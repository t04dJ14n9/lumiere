import { parseTable } from "../../markdown/tables/model";

/**
 * CodeMirror sizes a block widget from `estimatedHeight` until it measures
 * the widget, and again when a rebuilt decoration sits outside the viewport.
 * The default, -1, is one line. A table widget can be hundreds of pixels tall,
 * so that one-line reserve collapses the height map after an off-viewport
 * rebuild (scroll/PageDown then lands in empty mapped space).
 *
 * Numbers match the default sheet in `tables.css`: 16px font, 1.3 line-height,
 * 4px vertical cell padding, and the table wrapper's 16px top padding.
 */
const TEXT = 16;
const LINE = TEXT * 1.3;
const CELL_PAD_Y = 4 + 4;
const ROW = CELL_PAD_Y + LINE;
const WRAPPER_TOP = 16;
/** Bottom add-strip / grip chrome kept small so short tables are not overshot. */
const CHROME = WRAPPER_TOP + 8;

/** Reserve table height from the Markdown source before the DOM is measured. */
export function tableEstimatedHeight(source: string): number {
  const model = parseTable(source);
  if (!model || model.rows.length === 0) {
    return ROW + CHROME;
  }
  // parseTable rows exclude the delimiter line; header + body match the grid.
  return CHROME + model.rows.length * ROW;
}
