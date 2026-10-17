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

function pointInBounds(point: PointerPoint, bounds: DOMRect): boolean {
  return (
    point.x >= bounds.left &&
    point.x <= bounds.right &&
    point.y >= bounds.top &&
    point.y <= bounds.bottom
  );
}

/**
 * Cell under the pointer only when the hit target is actually inside a cell.
 * Unlike {@link cellAtPoint}, points past the table edge do not clamp to the
 * nearest row/column — used so a text drag that leaves a cell is not converted
 * into a grid/column selection.
 *
 * Row/column grips (`.table-handle`) are absolutely positioned outside the
 * cell box but live inside `.table-cell-wrapper`, so DOM ancestry alone would
 * falsely claim the owning cell. Reject handle hits and require the point to
 * lie in the resolved cell's layout box.
 */
export function cellUnderPoint(
  table: HTMLTableElement,
  point: PointerPoint,
): CellPosition | undefined {
  const node =
    typeof document !== "undefined"
      ? document.elementFromPoint(point.x, point.y)
      : null;
  if (!node || typeof (node as Element).closest !== "function") {
    return undefined;
  }
  const el = node as Element;
  // Grips / chrome inside the wrapper must not count as cell content.
  if (el.closest(".table-handle")) {
    return undefined;
  }
  const cell = el.closest<HTMLElement>("td[data-row], th[data-row]");
  if (!cell || !table.contains(cell)) {
    return undefined;
  }
  if (!pointInBounds(point, cell.getBoundingClientRect())) {
    return undefined;
  }
  return {
    row: Number(cell.dataset.row),
    column: Number(cell.dataset.column),
  };
}
