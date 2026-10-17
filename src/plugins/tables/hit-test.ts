import type { CellPosition } from "../../markdown/tables/model";
import type { Axis } from "../../markdown/tables/operations";
import type { PointerPoint } from "../../webview/ui/edge-scroll";

/** Resolve physical coordinates, including RTL columns and points past an edge. */
export function nearestEntry(
  entries: Iterable<Element>,
  axis: Axis,
  point: PointerPoint,
): number {
  const horizontal = axis === "column";
  const position = horizontal ? point.x : point.y;
  let nearest = Infinity;
  let selected = -1;
  let index = 0;
  for (const entry of entries) {
    const bounds = entry.getBoundingClientRect();
    const from = horizontal ? bounds.left : bounds.top;
    const to = horizontal ? bounds.right : bounds.bottom;
    const distance = Math.max(from - position, position - to, 0);
    if (distance < nearest) {
      nearest = distance;
      selected = index;
    }
    index++;
  }
  return selected;
}

export function cellAtPoint(
  table: HTMLTableElement,
  point: PointerPoint,
): CellPosition | undefined {
  const row = nearestEntry(table.rows, "row", point);
  const cells = table.rows[row]?.cells;
  const column = cells ? nearestEntry(cells, "column", point) : -1;
  return row < 0 || column < 0 ? undefined : { row, column };
}

/**
 * Cell under the pointer only when the hit target is actually inside a cell.
 * Unlike {@link cellAtPoint}, points past the table edge do not clamp to the
 * nearest row/column — used so a text drag that leaves a cell is not converted
 * into a grid/column selection.
 */
export function cellUnderPoint(
  table: HTMLTableElement,
  point: PointerPoint,
): CellPosition | undefined {
  const node =
    typeof document !== "undefined"
      ? document.elementFromPoint(point.x, point.y)
      : null;
  const cell =
    node &&
    typeof (node as Element).closest === "function"
      ? (node as Element).closest<HTMLElement>("td[data-row], th[data-row]")
      : null;
  if (!cell || !table.contains(cell)) {
    return undefined;
  }
  return {
    row: Number(cell.dataset.row),
    column: Number(cell.dataset.column),
  };
}
