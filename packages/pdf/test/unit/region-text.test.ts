import assert from "node:assert/strict";
import { test } from "node:test";
import {
  regionRuns,
  regionText,
  type TextRun,
} from "../../src/shared/region-text";

const run = (
  content: string,
  left: number,
  top: number,
  right: number,
  bottom: number,
): TextRun => ({ content, rect: [left, top, right, bottom] });

test("region text reads the runs inside the box row by row, left to right", () => {
  const runs = [
    // Out of order, as a PDF may store a table column by column.
    run("4.92", 300, 110, 330, 120),
    run("base", 100, 110, 130, 120),
    run("5.29", 300, 125, 330, 135),
    run("(A)", 100, 125.5, 125, 135.5),
    run("Table 3: Variations", 100, 90, 250, 100),
    run("outside", 400, 110, 450, 120),
    run("  ", 200, 110, 210, 120),
  ];
  assert.equal(regionText(runs, [95, 105, 340, 140]), "base 4.92\n(A) 5.29");
  assert.equal(
    regionText(runs, [95, 85, 340, 140]),
    "Table 3: Variations\nbase 4.92\n(A) 5.29",
  );
  assert.equal(regionText(runs, [0, 0, 10, 10]), "");
});

test("region runs are the consecutive characters inside the box, one line each", () => {
  const char = (
    left: number,
    top: number,
  ): [number, number, number, number] => [left, top, left + 8, top + 10];
  const chars = [
    char(10, 0),
    char(20, 0),
    undefined,
    char(40, 0),
    char(50, 0), // "ab cd", d outside on the right
    undefined, // a line break PDFium adds
    char(10, 20),
    char(20, 20), // "ef"
    char(10, 40), // "g", below the box
  ];
  assert.deepEqual(regionRuns(chars, [5, -5, 49, 35]), [
    { charIndex: 0, charCount: 4, rect: [10, 0, 48, 10] },
    { charIndex: 6, charCount: 2, rect: [10, 20, 28, 30] },
  ]);
  assert.deepEqual(regionRuns(chars, [100, 100, 200, 200]), []);
});

test("a row label centred on two table rows does not merge them", () => {
  const runs = [
    run("16 5.16 25.1 58", 150, 100, 400, 110),
    run("32 5.01 25.4 60", 150, 112, 400, 122),
    run("(B)", 100, 106, 120, 116),
    // A header just above the first data row.
    run("steps (dev) ×106", 150, 80, 400, 90),
    run("base 6 512", 100, 92, 400, 98),
  ];
  assert.equal(
    regionText(runs, [0, 0, 500, 500]),
    "steps (dev) ×106\nbase 6 512\n16 5.16 25.1 58\n(B)\n32 5.01 25.4 60",
  );
});

test("a superscript does not pull the next line into its run", () => {
  const box = (
    left: number,
    top: number,
    bottom: number,
  ): [number, number, number, number] => [left, top, left + 8, bottom];
  // "x²" then "y" on the next line, with no line break character between.
  const chars = [box(10, 10, 20), box(18, 6, 14), box(10, 22, 32)];
  assert.deepEqual(
    regionRuns(chars, [0, 0, 100, 100]).map(({ charIndex, charCount }) => [
      charIndex,
      charCount,
    ]),
    [
      [0, 2],
      [2, 1],
    ],
  );
});

test("a subscript split off its word joins it again; separate cells keep a space", () => {
  const runs = [
    run("P", 100, 100, 108, 110),
    run("drop", 108.5, 104, 125, 112),
    run("0.1", 140, 100, 155, 110),
  ];
  assert.equal(regionText(runs, [0, 0, 500, 500]), "Pdrop 0.1");
});
