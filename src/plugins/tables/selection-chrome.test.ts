import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { selectedCells } from "./selection";

const root = new URL("../../..", import.meta.url).pathname;
const css = readFileSync(
  path.join(root, "src/plugins/tables/tables.css"),
  "utf8",
).replace(/\s+/g, " ");

test("a grid rectangle selects every cell in its inclusive bounds", () => {
  assert.deepEqual(
    selectedCells(
      { rows: 3, columns: 3 },
      {
        anchor: { row: 0, column: 1 },
        head: { row: 2, column: 1 },
      },
      { row: 1, column: 0 },
    ),
    [
      [false, true, false],
      [false, true, false],
      [false, true, false],
    ],
  );
});

test("without a grid range the open cell still has selection chrome", () => {
  assert.deepEqual(
    selectedCells({ rows: 2, columns: 2 }, undefined, {
      row: 1,
      column: 0,
    }),
    [
      [false, false],
      [true, false],
    ],
  );
});

test("cleared range and closed cell remove every selection mark", () => {
  assert.deepEqual(
    selectedCells({ rows: 2, columns: 2 }, undefined, undefined),
    [
      [false, false],
      [false, false],
    ],
  );
});

test("selected cells draw an inset accent box that survives overflow clipping", () => {
  assert.match(
    css,
    /\.hybrid-table \.table-cell-selected \{[^}]*box-shadow: inset 0 0 0 2px var\(--accent\);/,
  );
  assert.doesNotMatch(
    css,
    /\.hybrid-table \.table-cell-selected \{[^}]*outline:/,
  );
});
