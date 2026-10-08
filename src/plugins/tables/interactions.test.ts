import test from "node:test";
import assert from "node:assert/strict";
import { ChangeSet, Text } from "@codemirror/state";
import { parseTable } from "../../markdown/tables/model";
import { projectedChanges } from "./projection";
import { axisRange } from "./selection";
import { wrapCell } from "./keyboard";
import { containsCell } from "./toolbar";
import { tableMenu, type TableMenuActions } from "./menu";
import { tableOperation } from "./commands";

const source = "| first | second |\n| --- | --- |\n| alpha | beta |";
const table = parseTable(source)!;

test("cell projection preserves table syntax and the surrounding document", () => {
  const cell = table.rows[1]![0]!;
  const prefix = "# Heading\n\n";
  const outer = prefix + source + "\n\nTail";
  for (const text of ["a changed cell", "", "😀字"]) {
    const changes = projectedChanges(source, cell, text, prefix.length);
    const result = ChangeSet.of(changes, outer.length)
      .apply(Text.of(outer.split("\n")))
      .toString();
    assert.equal(
      result,
      prefix +
        source.slice(0, cell.from) +
        text +
        source.slice(cell.to) +
        "\n\nTail",
    );
  }
});

test("axis selections and reverse rectangles use inclusive cell bounds", () => {
  assert.deepEqual(axisRange(table, "row", 1), {
    anchor: { row: 1, column: 0 },
    head: { row: 1, column: 1 },
  });
  assert.deepEqual(axisRange(table, "column", 1), {
    anchor: { row: 0, column: 1 },
    head: { row: 1, column: 1 },
  });
  const range = { anchor: { row: 2, column: 3 }, head: { row: 0, column: 1 } };
  assert.equal(containsCell(range, { row: 1, column: 2 }), true);
  assert.equal(containsCell(range, range.anchor), true);
  assert.equal(containsCell(range, { row: 1, column: 0 }), false);
  assert.equal(containsCell(undefined, range.head), false);
});

test("cell movement wraps columns while retaining exit and append-row targets", () => {
  assert.deepEqual(wrapCell({ row: 1, column: 2 }, 2), { row: 2, column: 0 });
  assert.deepEqual(wrapCell({ row: 0, column: -1 }, 2), { row: -1, column: 1 });
  assert.deepEqual(wrapCell({ row: 1, column: 0 }, 2), { row: 1, column: 0 });
});

test("table menus preserve axis bounds, command focus and action order", () => {
  const calls: unknown[] = [];
  const actions: TableMenuActions = {
    copy: (cut) => {
      calls.push(cut);
    },
    paste: async () => {},
    format: (marker) => {
      calls.push(marker);
    },
    clear: () => {},
    source: () => {},
    execute: (operation, focus) => {
      calls.push({ operation, focus });
    },
  };
  const range = axisRange(table, "column", 0);
  const menu = tableMenu(table, range, actions, "column");
  assert.deepEqual(
    menu.map((item) => item.label),
    [
      "Add column to the left",
      "Add column to the right",
      "Move column right",
      "Align left",
      "Align center",
      "Align right",
      "Duplicate column",
      "Delete column",
      "Sort by column (A to Z)",
      "Sort by column (Z to A)",
    ],
  );
  menu[2]!.run!();
  assert.deepEqual(calls.pop(), {
    operation: { type: "move", axis: "column", from: 0, to: 0, destination: 1 },
    focus: { row: 0, column: 1 },
  });
  menu[4]!.run!();
  assert.deepEqual(calls.pop(), {
    operation: { type: "align", from: 0, to: 0, alignment: "center" },
    focus: range.head,
  });
  const general = tableMenu(table, range, actions);
  assert.deepEqual(
    general.slice(0, 6).map((item) => item.label),
    ["Cut", "Copy", "Paste", "Format", "Row", "Column"],
  );
});

test("table command parsing keeps alignment validation and movement boundaries", () => {
  const cell = { row: 0, column: 1 };
  assert.deepEqual(tableOperation("align-right", cell), {
    type: "align",
    from: 1,
    to: 1,
    alignment: "right",
  });
  assert.equal(tableOperation("align-invalid", cell), undefined);
  assert.deepEqual(tableOperation("move-row-up", cell), {
    type: "move",
    axis: "row",
    from: 0,
    to: 0,
    destination: 0,
  });
});
