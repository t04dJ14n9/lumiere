import test from "node:test";
import assert from "node:assert/strict";
import {
  cellText,
  copyCells,
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

test("padding counts UTF-16 code units, as Obsidian 1.14.4 does (measured), for CJK, emoji, combining marks and ZWJ sequences", () => {
  // Obsidian 1.14.4: `| 中文  |` (2 + 1 pad), `| 😀  |` (2 + 1 pad), `| é  |`
  // (2 + 1 pad) and a 8-unit family emoji widening the whole column to 8.
  assert.equal(
    serializeTable([["h"], ["中文"]], [null]),
    "| h   |\n| --- |\n| 中文  |",
  );
  assert.equal(
    serializeTable([["h"], ["😀"]], [null]),
    "| h   |\n| --- |\n| 😀  |",
  );
  assert.equal(
    serializeTable([["h"], ["e\u0301"]], [null]),
    "| h   |\n| --- |\n| e\u0301  |",
  );
  const family = "👨‍👩‍👧";
  assert.equal(family.length, 8);
  assert.equal(
    serializeTable([["h"], [family]], [null]),
    `| h        |\n| -------- |\n| ${family} |`,
  );
  // Aligned cells pad on the side the alignment asks for, by the same measure.
  assert.equal(
    serializeTable([["h"], ["中文"]], ["right"]),
    "|   h |\n| --: |\n|  中文 |",
  );
});

test("rectangular clipboard serialization includes every column in either selection direction", () => {
  const table = parseTable(
    "| a | b | c |\n|---|---|---|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |",
  )!;
  for (const range of [
    { anchor: { row: 1, column: 0 }, head: { row: 2, column: 1 } },
    { anchor: { row: 2, column: 1 }, head: { row: 1, column: 0 } },
    { anchor: { row: 1, column: 1 }, head: { row: 2, column: 0 } },
  ]) {
    assert.equal(copyCells(table, range), "1\t2\n4\t5");
  }
});
