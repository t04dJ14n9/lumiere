import test from "node:test";
import assert from "node:assert/strict";
import {
  cellText,
  parseTable,
  serializeTable,
  writeCells,
} from "../../markdown/tables/model";

test("serialization pads cell values by column alignment and expands every delimiter", () => {
  assert.equal(
    serializeTable(
      [
        ["wide", "center", "right", "left"],
        ["a", "x", "1", "z"],
        ["", "", "", ""],
      ],
      [null, "center", "right", "left"],
    ),
    [
      "| wide | center | right | left |",
      "| ---- | :----: | ----: | :--- |",
      "| a    |   x    |     1 | z    |",
      "|      |        |       |      |",
    ].join("\n"),
  );
  assert.equal(
    serializeTable(
      [
        ["a", "b", "c"],
        ["", "", ""],
      ],
      [null, "center", "right"],
    ),
    "| a   |  b  |   c |\n| --- | :-: | --: |\n|     |     |     |",
  );
});

test("every write aligns the entire table, including omitted cells and existing inline Markdown", () => {
  const table = parseTable(
    "| a | b | c |\n|---|:-:|--:|\n| **b** |\n| x | y | z |",
  )!;
  const next = writeCells(
    table,
    { anchor: { row: 1, column: 2 }, head: { row: 1, column: 2 } },
    [["a|b"]],
  );
  assert.equal(
    next,
    "| a     |  b  |    c |\n| ----- | :-: | ---: |\n| **b** |     | a\\|b |\n| x     |  y  |    z |",
  );
  assert.deepEqual(parseTable(next)!.alignments, table.alignments);
});

test("pipe escaping is idempotent, retains typed backslashes and keeps code pipes within one cell", () => {
  for (let count = 0; count <= 5; count++) {
    const text = `x${"\\".repeat(count)}|y\\z`;
    const encoded = cellText(text);
    assert.equal(
      encoded,
      `x${"\\".repeat(count + (count % 2 === 0 ? 1 : 0))}|y\\z`,
    );
    assert.equal(cellText(encoded), encoded);
    const source = serializeTable(
      [
        ["a", "b"],
        [text, "tail"],
      ],
      [null, "right"],
    );
    const table = parseTable(source)!;
    assert.equal(table.rows[1]![0]!.text, encoded);
    assert.equal(table.rows[1]![1]!.text, "tail");
    assert.equal(
      serializeTable(
        table.rows.map((row) => row.map((cell) => cell.text)),
        table.alignments,
      ),
      source,
    );
  }
  assert.equal(cellText("**b** `c|d`\r\ntwo"), "**b** `c\\|d`<br>two");
  assert.equal(cellText("\\"), "\\");
});
