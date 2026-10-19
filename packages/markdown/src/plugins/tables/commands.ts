import type { CellPosition } from "../../markdown/tables/model";
import type { TableOperation } from "../../markdown/tables/operations";
import type { EditorState, TransactionSpec } from "@codemirror/state";

/** The table Insert Table adds: two empty columns, as Obsidian's. */
const NEW_TABLE = "|     |     |\n| --- | --- |\n|     |     |";

/**
 * Insert Table, as in Obsidian: a new table after the line the selection
 * starts on, a blank line between them unless that line is empty, and the
 * caret at its start.
 */
export function insertTable(state: EditorState): TransactionSpec {
  const line = state.doc.lineAt(state.selection.main.from);
  const before = line.length ? "\n\n" : "\n";
  return {
    changes: { from: line.to, insert: `${before}${NEW_TABLE}\n` },
    selection: { anchor: line.to + before.length },
    userEvent: "input",
  };
}

export function tableOperation(
  id: string,
  cell: CellPosition,
): TableOperation | undefined {
  const { row, column } = cell;
  const alignment = alignmentOperation(id, column);
  if (alignment) {
    return alignment;
  }
  if (id === "sort-ascending" || id === "sort-descending") {
    return {
      type: "sort",
      column,
      direction: id === "sort-ascending" ? "ascending" : "descending",
    };
  }
  const axis = id.includes("row") ? "row" : "column";
  return lineOperation(id, axis, axis === "row" ? row : column);
}

/** Insert, delete, duplicate or move the row or column at `index`. */
function lineOperation(
  id: string,
  axis: "row" | "column",
  index: number,
): TableOperation | undefined {
  if (id.startsWith("insert-")) {
    return {
      type: "insert",
      axis,
      index: index + (id.endsWith("below") || id.endsWith("right") ? 1 : 0),
    };
  }
  if (id.startsWith("delete-") || id.startsWith("duplicate-")) {
    const type = id.startsWith("delete-") ? "delete" : "duplicate";
    return { type, axis, from: index, to: index };
  }
  if (id.startsWith("move-")) {
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
  }
  return undefined;
}

function alignmentOperation(
  id: string,
  column: number,
): TableOperation | undefined {
  if (id.startsWith("align-")) {
    const alignment = id.slice(6);
    if (
      alignment === "left" ||
      alignment === "center" ||
      alignment === "right"
    ) {
      return { type: "align", from: column, to: column, alignment };
    }
  }
  return undefined;
}
