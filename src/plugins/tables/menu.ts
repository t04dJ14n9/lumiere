import {
  rectangle,
  type CellPosition,
  type CellRange,
  type Table,
} from "../../markdown/tables/model";
import type { Axis, TableOperation } from "../../markdown/tables/operations";
import type { MenuItem } from "../editor/api";

export interface TableMenuActions {
  copy(cut: boolean): void;
  paste(): Promise<void>;
  format(marker: string | null): void;
  clear(): void;
  execute(operation: TableOperation, focus: CellPosition): void;
  source(): void;
}

export function tableMenu(
  table: Table,
  range: CellRange,
  actions: TableMenuActions,
  axis?: Axis,
): MenuItem[] {
  const area = rectangle(range);
  const axisItems = (axis: Axis): MenuItem[] => {
    const row = axis === "row";
    const from = row ? area.top : area.left;
    const to = row ? area.bottom : area.right;
    const size = row ? table.rows.length : table.alignments.length;
    const before = row ? "above" : "to the left";
    const after = row ? "below" : "to the right";
    const focus = (index: number): CellPosition =>
      row
        ? { row: index, column: area.left }
        : { row: area.top, column: index };
    const items: MenuItem[] = [
      {
        label: `Add ${axis} ${before}`,
        run: () =>
          actions.execute({ type: "insert", axis, index: from }, focus(from)),
      },
      {
        label: `Add ${axis} ${after}`,
        run: () =>
          actions.execute(
            { type: "insert", axis, index: to + 1 },
            focus(to + 1),
          ),
      },
    ];
    if (from > 0) {
      items.push({
        label: `Move ${axis} ${row ? "up" : "left"}`,
        run: () =>
          actions.execute(
            { type: "move", axis, from, to, destination: from - 1 },
            focus(from - 1),
          ),
      });
    }
    if (to < size - 1) {
      items.push({
        label: `Move ${axis} ${row ? "down" : "right"}`,
        run: () =>
          actions.execute(
            { type: "move", axis, from, to, destination: from + 1 },
            focus(from + 1),
          ),
      });
    }
    if (!row) {
      items.push(...alignments());
    }
    items.push(
      {
        label: `Duplicate ${axis}`,
        run: () =>
          actions.execute({ type: "duplicate", axis, from, to }, focus(to + 1)),
      },
      {
        label: `Delete ${axis}`,
        run: () =>
          actions.execute({ type: "delete", axis, from, to }, focus(from)),
      },
    );
    return items;
  };
  const alignments = (): MenuItem[] =>
    (["left", "center", "right"] as const).map((alignment) => ({
      label: `Align ${alignment}`,
      run: () =>
        actions.execute(
          { type: "align", from: area.left, to: area.right, alignment },
          range.head,
        ),
    }));
  const format = (
    [
      ["Bold", "**"],
      ["Italic", "*"],
      ["Strikethrough", "~~"],
      ["Highlight", "=="],
      ["Code", "`"],
      ["Math", "$"],
      ["Comment", "%%"],
      ["Clear formatting", null],
    ] as const
  ).map(([label, marker]) => ({ label, run: () => actions.format(marker) }));
  const sorting = (["ascending", "descending"] as const).map(
    (direction): MenuItem => ({
      label: `Sort by column (${direction === "ascending" ? "A to Z" : "Z to A"})`,
      run: () =>
        actions.execute(
          { type: "sort", column: range.head.column, direction },
          range.head,
        ),
    }),
  );
  if (axis) {
    return [...axisItems(axis), ...(axis === "column" ? sorting : [])];
  }
  return [
    { label: "Cut", run: () => actions.copy(true) },
    { label: "Copy", run: () => actions.copy(false) },
    { label: "Paste", run: () => actions.paste() },
    { label: "Format", children: format },
    { label: "Row", children: axisItems("row") },
    { label: "Column", children: axisItems("column") },
    ...sorting,
    { label: "Clear selected cells", run: () => actions.clear() },
    { label: "Edit table source", run: () => actions.source() },
  ];
}
