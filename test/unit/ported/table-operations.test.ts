import { test } from "node:test";
import assert from "node:assert/strict";
import { operateTable } from "../../../src/markdown/tables/operations";
import { parseTable, type Table } from "../../../src/markdown/tables/model";

const source =
  "| Name | Value | Notes |\n| --- | ---: | :---: |\n| Alpha | 10 | A \\| pipe |\n| Beta | 20 | **Bold** |";
const values = (table: Table) => table.rows.map((row) => row.map((cell) => cell.text));

test("row operations can exchange or replace the header without losing cell content", () => {
  const table = parseTable(source)!;
  const moved = parseTable(
    operateTable(table, {
      type: "move",
      axis: "row",
      from: 1,
      to: 1,
      destination: 0,
    }),
  )!;
  assert.deepEqual(values(moved), [values(table)[1], values(table)[0], values(table)[2]]);
  assert.deepEqual(moved.alignments, table.alignments);
  const inserted = parseTable(operateTable(table, { type: "insert", axis: "row", index: 0 }))!;
  assert.deepEqual(values(inserted), [["", "", ""], ...values(table)]);
  const promoted = parseTable(
    operateTable(table, { type: "delete", axis: "row", from: 0, to: 0 }),
  )!;
  assert.deepEqual(values(promoted), values(table).slice(1));
  assert.equal(operateTable(table, { type: "delete", axis: "row", from: 0, to: 2 }), "");
});

test("column moves and duplication keep alignment with the source values", () => {
  const table = parseTable(source)!;
  const moved = parseTable(
    operateTable(table, {
      type: "move",
      axis: "column",
      from: 0,
      to: 0,
      destination: 2,
    }),
  )!;
  assert.deepEqual(moved.alignments, ["right", "center", null]);
  assert.deepEqual(values(moved)[1], ["10", "A \\| pipe", "Alpha"]);
  const duplicated = parseTable(
    operateTable(table, { type: "duplicate", axis: "column", from: 1, to: 2 }),
  )!;
  assert.deepEqual(duplicated.alignments, [null, "right", "center", "right", "center"]);
  assert.deepEqual(values(duplicated)[1], ["Alpha", "10", "A \\| pipe", "10", "A \\| pipe"]);
  const reduced = parseTable(
    operateTable(table, { type: "delete", axis: "column", from: 1, to: 2 }),
  )!;
  assert.deepEqual(values(reduced), [["Name"], ["Alpha"], ["Beta"]]);
  assert.equal(operateTable(reduced, { type: "delete", axis: "column", from: 0, to: 0 }), "");
});

test("alignment and sorting preserve the header and unrelated cell contents", () => {
  const table = parseTable(source)!;
  const aligned = parseTable(
    operateTable(table, { type: "align", from: 0, to: 1, alignment: "center" }),
  )!;
  assert.deepEqual(aligned.alignments, ["center", "center", "center"]);
  assert.deepEqual(values(aligned), values(table));
  const sorted = parseTable(
    operateTable(table, { type: "sort", column: 1, direction: "descending" }),
  )!;
  assert.deepEqual(values(sorted), [values(table)[0], values(table)[2], values(table)[1]]);
});
