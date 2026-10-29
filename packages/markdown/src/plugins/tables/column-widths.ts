import type { TableOperation } from "../../markdown/tables/operations";
/** Minimum rendered column width in CSS pixels (matches cell min-width). */
export const MIN_COLUMN_WIDTH = 60;

const WIDTHS_COMMENT = /^<!--\s*lumiere-col-widths:\s*([0-9.,\s]*)\s*-->\s*$/;

export type ColumnWidth = number | undefined;

export type ColumnWidthOp =
  | { type: "insert"; index: number }
  | { type: "delete"; from: number; to: number }
  | { type: "move"; from: number; to: number; destination: number }
  | { type: "duplicate"; from: number; to: number };

/** Parse `<!-- lumiere-col-widths: 120,80 -->` on its own line. */
export function parseColWidthsComment(line: string): ColumnWidth[] | undefined {
  const match = WIDTHS_COMMENT.exec(line.trim());
  if (!match) {
    return undefined;
  }
  const parts = match[1]!.split(",");
  if (!parts.length) {
    return undefined;
  }
  const widths: ColumnWidth[] = parts.map((part) => {
    const trimmed = part.trim();
    if (!trimmed) {
      return undefined;
    }
    const value = Number(trimmed);
    return Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;
  });
  if (!widths.some((width) => width !== undefined)) {
    return undefined;
  }
  return widths;
}

export function formatColWidthsComment(widths: ColumnWidth[]): string {
  const body = widths
    .map((width) => (width === undefined ? "" : String(Math.round(width))))
    .join(",");
  return `<!-- lumiere-col-widths: ${body} -->`;
}

/**
 * Split a table block source into GFM table text and optional trailing widths
 * comment. Convention: the comment sits on the line immediately after the
 * table (no blank line), so Lumière can round-trip pixel column widths in
 * source. GFM has no column-width syntax; Obsidian Live Preview does not
 * persist ordinary-table widths either.
 */
export function splitTableSource(source: string): {
  table: string;
  widths: ColumnWidth[] | undefined;
} {
  const lines = source.split("\n");
  if (lines.length < 2) {
    return { table: source, widths: undefined };
  }
  const last = lines[lines.length - 1]!;
  const widths = parseColWidthsComment(last);
  if (!widths) {
    return { table: source, widths: undefined };
  }
  return { table: lines.slice(0, -1).join("\n"), widths };
}

export function joinTableSource(
  table: string,
  widths: ColumnWidth[] | undefined,
): string {
  if (!widths?.length || !widths.some((width) => width !== undefined)) {
    return table;
  }
  return `${table}\n${formatColWidthsComment(widths)}`;
}

export function applyColumnWidth(
  widths: number[],
  column: number,
  next: number,
  min = MIN_COLUMN_WIDTH,
): number[] {
  const result = widths.slice();
  result[column] = Math.max(min, Math.round(next));
  return result;
}

/** Keep stored widths aligned when columns are inserted, removed or moved. */
export function remapColumnWidths(
  widths: ColumnWidth[] | undefined,
  operation: ColumnWidthOp,
): ColumnWidth[] | undefined {
  if (!widths) {
    return undefined;
  }
  const next = widths.slice();
  if (operation.type === "insert") {
    next.splice(operation.index, 0, undefined);
  } else if (operation.type === "delete") {
    next.splice(operation.from, operation.to - operation.from + 1);
  } else if (operation.type === "duplicate") {
    next.splice(
      operation.to + 1,
      0,
      ...next.slice(operation.from, operation.to + 1),
    );
  } else if (operation.type === "move") {
    const moved = next.splice(
      operation.from,
      operation.to - operation.from + 1,
    );
    next.splice(operation.destination, 0, ...moved);
  }
  return next;
}

/**
 * Expand a Table syntax node so a trailing `lumiere-col-widths` comment is
 * part of the same Live Preview block (and is not claimed as HTMLBlock).
 */
export function tableBlockRange(
  doc: string,
  from: number,
  to: number,
): { from: number; to: number } {
  if (to >= doc.length || doc[to] !== "\n") {
    return { from, to };
  }
  const lineStart = to + 1;
  let lineEnd = doc.indexOf("\n", lineStart);
  if (lineEnd < 0) {
    lineEnd = doc.length;
  }
  const line = doc.slice(lineStart, lineEnd);
  if (!parseColWidthsComment(line)) {
    return { from, to };
  }
  return { from, to: lineEnd };
}

/** Remap stored widths for a table structural operation (column axis only). */
export function widthsAfterOperation(
  widths: ColumnWidth[] | undefined,
  operation: TableOperation,
): ColumnWidth[] | undefined {
  if (!("axis" in operation) || operation.axis !== "column") {
    return widths;
  }
  if (operation.type === "insert") {
    return remapColumnWidths(widths, {
      type: "insert",
      index: operation.index,
    });
  }
  if (operation.type === "move") {
    return remapColumnWidths(widths, {
      type: "move",
      from: operation.from,
      to: operation.to,
      destination: operation.destination,
    });
  }
  if (operation.type === "delete" || operation.type === "duplicate") {
    return remapColumnWidths(widths, {
      type: operation.type,
      from: operation.from,
      to: operation.to,
    });
  }
  return widths;
}

/** Apply a structural edit and keep column-width metadata in sync. */
export function sourceAfterOperation(
  tableMarkdown: string,
  widths: ColumnWidth[] | undefined,
  operation: TableOperation,
): string {
  return joinTableSource(
    tableMarkdown,
    widthsAfterOperation(widths, operation),
  );
}

/** Grow a Table range when the next line is a widths comment (EditorState-friendly). */
export function extendTableRangeForWidths(
  nextLineText: string | undefined,
  from: number,
  to: number,
  nextLineTo: number,
): { from: number; to: number } {
  if (!nextLineText || !parseColWidthsComment(nextLineText)) {
    return { from, to };
  }
  return { from, to: nextLineTo };
}
