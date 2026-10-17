import { serializeTable, type Table } from "./model";

export type Axis = "row" | "column";
export type TableOperation =
  | { type: "insert"; axis: Axis; index: number }
  | { type: "delete" | "duplicate"; axis: Axis; from: number; to: number }
  | { type: "move"; axis: Axis; from: number; to: number; destination: number }
  | {
      type: "align";
      from: number;
      to: number;
      alignment: "left" | "center" | "right";
    }
  | { type: "sort"; column: number; direction: "ascending" | "descending" };

/** Every structural command produces one complete Markdown edit. */
export function operateTable(table: Table, operation: TableOperation): string {
  const rows = table.rows.map((row) => row.map((cell) => cell.text));
  const alignments = [...table.alignments];
  if (operation.type === "align") {
    for (let column = operation.from; column <= operation.to; column++) {
      alignments[column] = operation.alignment;
    }
  } else if (operation.type === "sort") {
    const collator = new Intl.Collator(undefined, {
      numeric: true,
      sensitivity: "base",
    });
    const direction = operation.direction === "ascending" ? 1 : -1;
    const body = rows
      .slice(1)
      .sort(
        (left, right) =>
          direction *
          collator.compare(
            left[operation.column] ?? "",
            right[operation.column] ?? "",
          ),
      );
    rows.splice(1, rows.length - 1, ...body);
  } else {
    const edit = <T>(items: T[], empty: () => T): void => {
      if (operation.type === "insert") {
        items.splice(operation.index, 0, empty());
      } else if (operation.type === "duplicate") {
        items.splice(
          operation.to + 1,
          0,
          ...items.slice(operation.from, operation.to + 1),
        );
      } else if (operation.type === "delete") {
        items.splice(operation.from, operation.to - operation.from + 1);
      } else if (operation.type === "move") {
        const moved = items.splice(
          operation.from,
          operation.to - operation.from + 1,
        );
        items.splice(operation.destination, 0, ...moved);
      }
    };
    if (operation.axis === "row") {
      edit(rows, () => Array<string>(alignments.length).fill(""));
    } else {
      edit(alignments, () => null);
      for (const row of rows) {
        edit(row, () => "");
      }
    }
  }
  return rows.length && alignments.length
    ? serializeTable(rows, alignments)
    : "";
}
