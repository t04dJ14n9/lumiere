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
