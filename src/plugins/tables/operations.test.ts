import test from "node:test";
import assert from "node:assert/strict";
import { parseTable, type Table } from "../../markdown/tables/model";
import { operateTable } from "../../markdown/tables/operations";

const source =
  "| name | value |\n| :--- | ---: |\n| Zebra | 10 |\n| alpha | 2 |\n| ALPHA | 2 |\n| beta | 1 |";
const values = (table: Table) =>
  table.rows.map((row) => row.map((cell) => cell.text));

test("sort works in both directions, is stable for ties and keeps the header and alignments", () => {
  const table = parseTable(source)!;
  for (const direction of ["ascending", "descending"] as const) {
    const sorted = parseTable(
      operateTable(table, { type: "sort", column: 1, direction }),
    )!;
    assert.deepEqual(
      sorted.rows.slice(1).map((row) => row[0]!.text),
      direction === "ascending"
        ? ["beta", "alpha", "ALPHA", "Zebra"]
        : ["Zebra", "alpha", "ALPHA", "beta"],
    );
    assert.deepEqual(values(sorted)[0], ["name", "value"]);
    assert.deepEqual(sorted.alignments, ["left", "right"]);
  }
  const alphabetical = parseTable(
    operateTable(table, { type: "sort", column: 0, direction: "ascending" }),
  )!;
  assert.deepEqual(
    alphabetical.rows.slice(1).map((row) => row[0]!.text),
    ["alpha", "ALPHA", "beta", "Zebra"],
  );
});

test("all row and column operations preserve whole rows, column alignment and aligned source", () => {
  const table = parseTable(source)!;
  const insertedRow = parseTable(
    operateTable(table, { type: "insert", axis: "row", index: 2 }),
  )!;
  assert.deepEqual(values(insertedRow)[2], ["", ""]);
  assert.deepEqual(values(insertedRow).slice(3), values(table).slice(2));
  const duplicatedRow = parseTable(
    operateTable(table, { type: "duplicate", axis: "row", from: 1, to: 1 }),
  )!;
  assert.deepEqual(values(duplicatedRow).slice(1, 3), [
    ["Zebra", "10"],
    ["Zebra", "10"],
  ]);
  const movedRows = parseTable(
    operateTable(table, {
      type: "move",
      axis: "row",
      from: 2,
      to: 3,
      destination: 1,
    }),
  )!;
  assert.deepEqual(values(movedRows).slice(1), [
    ["alpha", "2"],
    ["ALPHA", "2"],
    ["Zebra", "10"],
    ["beta", "1"],
  ]);
  const insertedColumn = parseTable(
    operateTable(table, { type: "insert", axis: "column", index: 1 }),
  )!;
  assert.deepEqual(insertedColumn.alignments, ["left", null, "right"]);
  const movedColumn = parseTable(
    operateTable(table, {
      type: "move",
      axis: "column",
      from: 1,
      to: 1,
      destination: 0,
    }),
  )!;
  assert.deepEqual(movedColumn.alignments, ["right", "left"]);
  assert.deepEqual(values(movedColumn)[1], ["10", "Zebra"]);
  const duplicatedColumn = parseTable(
    operateTable(table, { type: "duplicate", axis: "column", from: 1, to: 1 }),
  )!;
  assert.deepEqual(duplicatedColumn.alignments, ["left", "right", "right"]);
  assert.deepEqual(values(duplicatedColumn)[1], ["Zebra", "10", "10"]);
  assert.deepEqual(
    values(
      parseTable(
        operateTable(table, { type: "delete", axis: "column", from: 1, to: 1 }),
      )!,
    ),
    [["name"], ["Zebra"], ["alpha"], ["ALPHA"], ["beta"]],
  );
  assert.deepEqual(
    values(
      parseTable(
        operateTable(table, { type: "delete", axis: "row", from: 0, to: 0 }),
      )!,
    ),
    values(table).slice(1),
  );
  assert.equal(
    operateTable(table, { type: "delete", axis: "column", from: 0, to: 1 }),
    "",
  );
});
