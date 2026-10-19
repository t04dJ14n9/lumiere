import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cellAtOffset,
  cellText,
  copyCells,
  insertColumn,
  insertRow,
  materializeCell,
  parseTable,
  pastedCells,
  rangeTexts,
  toggleMarker,
  writeCells,
} from "../../../src/markdown/tables/model";

const source =
  "| Name | Value | Notes |\n| --- | ---: | :---: |\n| Alpha | 10 | A \\| pipe |\n| Beta | 20 | `code` |";

test("table ranges select exact source cells and preserve escaped pipes and alignments", () => {
  const table = parseTable(source)!;
  assert.deepEqual(table.alignments, [null, "right", "center"]);
  assert.equal(table.rows[1]![2]!.text, "A \\| pipe");
  for (const row of table.rows) {
    for (const cell of row) {
      assert.equal(source.slice(cell.from, cell.to), cell.text);
    }
  }
  assert.equal(cellText("a|b\nnext"), "a\\|b<br>next");
  assert.equal(cellText("a\\|b"), "a\\|b");
});

test("rectangular clipboard and paste grow the table without destroying untouched cells", () => {
  const table = parseTable(source)!;
  const range = { anchor: { row: 1, column: 0 }, head: { row: 2, column: 1 } };
  assert.equal(copyCells(table, range), "Alpha\t10\nBeta\t20");
  const next = parseTable(
    writeCells(table, range, [
      ["One", "1"],
      ["Two", "2"],
      ["Three", "3"],
    ]),
  )!;
  assert.equal(next.rows.length, 4);
  assert.equal(next.rows[1]![2]!.text, "A \\| pipe");
  assert.equal(next.rows[3]![1]!.text, "3");
  const cleared = parseTable(writeCells(next, range, [[""]]))!;
  assert.equal(cleared.rows[2]![0]!.text, "");
  assert.equal(cleared.rows[2]![2]!.text, "`code`");
});

test("structural inserts preserve the header and column alignment", () => {
  const row = parseTable(insertRow(parseTable(source)!, 1))!;
  assert.equal(row.rows[2]![0]!.text, "");
  assert.equal(row.rows[3]![0]!.text, "Beta");
  const column = parseTable(insertColumn(row, 0))!;
  assert.deepEqual(column.alignments, [null, null, "right", "center"]);
  assert.equal(column.rows[0]![2]!.text, "Value");
  assert.equal(parseTable("just text\n---"), undefined);
});

test("omitted trailing cells gain delimiters without rewriting existing rows", () => {
  for (const row of ["| Alpha |", "Alpha", "| Alpha \\|"]) {
    const sparse = source.replace("| Alpha | 10 | A \\| pipe |", row);
    const table = parseTable(sparse)!;
    const edit = materializeCell(table, { row: 1, column: 2 }, " new|value ");
    const nextSource =
      sparse.slice(0, edit.from) + edit.insert + sparse.slice(edit.from);
    const next = parseTable(nextSource)!;
    assert.equal(next.rows[1]![0]!.text, table.rows[1]![0]!.text);
    assert.equal(next.rows[1]![1]!.text, "");
    assert.equal(next.rows[1]![2]!.text, "new\\|value");
    assert.equal(next.rows[1]![2]!.missing, undefined);
    assert.equal(
      nextSource.slice(edit.from + edit.insert.length),
      sparse.slice(edit.from),
    );
  }
});

test("short table separators retain HTML line breaks and empty trailing cells", () => {
  const table = parseTable(
    "| A | B | C |\n| - | - | - |\n| first<br/><br/>second | | |",
  )!;
  assert.deepEqual(table.alignments, [null, null, null]);
  assert.deepEqual(
    table.rows[1]!.map((cell) => cell.text),
    ["first<br/><br/>second", "", ""],
  );
});

test("pasted text splits into rows and tab-separated cells", () => {
  assert.deepEqual(pastedCells("a\tb\r\nc\td\r\n"), [
    ["a", "b"],
    ["c", "d"],
  ]);
  assert.deepEqual(pastedCells("one"), [["one"]]);
});

test("range texts keep source escapes that copying removes", () => {
  const table = parseTable(source)!;
  const range = { anchor: { row: 2, column: 2 }, head: { row: 1, column: 1 } };
  assert.deepEqual(rangeTexts(table, range), [
    ["10", "A \\| pipe"],
    ["20", "`code`"],
  ]);
  assert.equal(copyCells(table, range), "10\tA | pipe\n20\t`code`");
});

test("formatting markers toggle and leave empty cells empty", () => {
  assert.equal(toggleMarker("bold", "**"), "**bold**");
  assert.equal(toggleMarker("**bold**", "**"), "bold");
  assert.equal(toggleMarker("==mark==", "=="), "mark");
  assert.equal(toggleMarker("**half", "**"), "****half**");
  assert.equal(toggleMarker("", "**"), "");
});

test("an offset inside a cell's padding finds that cell", () => {
  const table = parseTable(source)!;
  const beta = table.rows[2]![0]!;
  assert.deepEqual(cellAtOffset(table, beta.rawFrom), { row: 2, column: 0 });
  assert.deepEqual(cellAtOffset(table, beta.to), { row: 2, column: 0 });
  assert.equal(cellAtOffset(table, source.length + 5), undefined);
});
