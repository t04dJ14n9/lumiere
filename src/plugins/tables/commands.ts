import type { CellPosition } from "../../markdown/tables/model";
import type { TableOperation } from "../../markdown/tables/operations";
export function tableOperation(
  id: string,
  cell: CellPosition,
): TableOperation | undefined {
  const { row, column } = cell;
  if (id.startsWith("align-")) {
    const alignment = id.slice(6);
    if (alignment === "left" || alignment === "center" || alignment === "right")
      return { type: "align", from: column, to: column, alignment };
  }
  if (id === "sort-ascending" || id === "sort-descending")
    return {
      type: "sort",
      column,
      direction: id === "sort-ascending" ? "ascending" : "descending",
    };
  const axis = id.includes("row") ? "row" : "column";
  const index = axis === "row" ? row : column;
  if (id.startsWith("insert-"))
    return {
      type: "insert",
      axis,
      index: index + (id.endsWith("below") || id.endsWith("right") ? 1 : 0),
    };
  if (id.startsWith("delete-"))
    return { type: "delete", axis, from: index, to: index };
  if (id.startsWith("move-"))
    return {
      type: "move",
      axis,
      from: index,
      to: index,
      destination: Math.max(
        0,
        index + (id.endsWith("up") || id.endsWith("left") ? -1 : 1),
      ),
    };
  return undefined;
}
