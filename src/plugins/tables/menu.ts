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
  paste(plainText: boolean): Promise<void>;
  selectAll(): void;
  format(marker: string | null): void;
  clear(): void;
  execute(operation: TableOperation, focus: CellPosition): void;
  canFormat?: boolean;
}

export function tableMenu(
  table: Table,
  range: CellRange,
  actions: TableMenuActions,
  axis?: Axis,
): MenuItem[] {
  const sorting = sortingItems(range, actions);
  if (axis) {
    return [
      ...axisItems({ table, range, actions, axis }),
      ...(axis === "column" ? sorting : []),
    ];
  }
  return [
    { label: "Cut", run: () => actions.copy(true) },
    { label: "Copy", run: () => actions.copy(false) },
    { label: "Paste", run: () => actions.paste(false) },
    { label: "Paste as plain text", run: () => actions.paste(true) },
    { label: "Select all", run: () => actions.selectAll() },
    {
      label: "Format",
      children: formatItems(actions),
      disabled: actions.canFormat === false,
    },
    {
      label: "Row",
      children: axisItems({ table, range, actions, axis: "row" }),
    },
    {
      label: "Column",
      children: axisItems({ table, range, actions, axis: "column" }),
    },
    ...sorting,
    { label: "Clear selected cells", run: () => actions.clear() },
  ];
}

interface AxisMenuOptions {
  table: Table;
  range: CellRange;
  actions: TableMenuActions;
  axis: Axis;
}

function axisItems(options: AxisMenuOptions): MenuItem[] {
  const { table, range, actions, axis } = options;
  const area = rectangle(range);
  const row = axis === "row";
  const from = row ? area.top : area.left;
  const to = row ? area.bottom : area.right;
  const size = row ? table.rows.length : table.alignments.length;
  const focus = (index: number): CellPosition =>
    row ? { row: index, column: area.left } : { row: area.top, column: index };
  const item = (
    label: string,
    operation: TableOperation,
    index: number,
    disabled = false,
  ): MenuItem => ({
    label,
    run: () => actions.execute(operation, focus(index)),
    disabled,
  });
  const items = [
    item(
      `Add ${axis} ${row ? "above" : "to the left"}`,
      { type: "insert", axis, index: from },
      from,
    ),
    item(
      `Add ${axis} ${row ? "below" : "to the right"}`,
      { type: "insert", axis, index: to + 1 },
      to + 1,
    ),
  ];
  items.push(
    item(
      `Move ${axis} ${row ? "up" : "left"}`,
      { type: "move", axis, from, to, destination: from - 1 },
      from - 1,
      from === 0,
    ),
    item(
      `Move ${axis} ${row ? "down" : "right"}`,
      { type: "move", axis, from, to, destination: from + 1 },
      from + 1,
      to === size - 1,
    ),
  );
  if (!row) {
    items.push(...alignmentItems(range, actions));
  }
  items.push(
    item(`Duplicate ${axis}`, { type: "duplicate", axis, from, to }, to + 1),
    item(`Delete ${axis}`, { type: "delete", axis, from, to }, from),
  );
  return items;
}

function alignmentItems(
  range: CellRange,
  actions: TableMenuActions,
): MenuItem[] {
  const area = rectangle(range);
  return (["left", "center", "right"] as const).map((alignment) => ({
    label: `Align ${alignment}`,
    run: () =>
      actions.execute(
        { type: "align", from: area.left, to: area.right, alignment },
        range.head,
      ),
  }));
}

function formatItems(actions: TableMenuActions): MenuItem[] {
  return (
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
}

function sortingItems(range: CellRange, actions: TableMenuActions): MenuItem[] {
  return (["ascending", "descending"] as const).map((direction) => ({
    label: `Sort by column (${direction === "ascending" ? "A to Z" : "Z to A"})`,
    run: () =>
      actions.execute(
        { type: "sort", column: range.head.column, direction },
        range.head,
      ),
  }));
}
