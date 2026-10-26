import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { selectedCells } from "./selection";
import { addStripClickCommits } from "./toolbar";

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

test("the cell being edited has no fill, so its text selection shows, and a glow around its edges", () => {
  const rule =
    /\.hybrid-table \.table-cell-selected\.is-editing \{([^}]*)\}/.exec(
      css,
    )?.[1] ?? "";
  assert.match(rule, /background: transparent;/);
  assert.match(rule, /inset 0 0 0 1px var\(--accent\)/);
  assert.match(
    rule,
    /0 0 0 3px color-mix\(in srgb, var\(--accent\) 35%, transparent\)/,
  );
  assert.match(rule, /z-index: 1;/);
});

test("row and column grips ignore pointer hits until the table is hovered or focused", () => {
  assert.match(css, /\.table-handle \{[^}]*pointer-events: none;/);
  assert.match(
    css,
    /\.hybrid-table:hover \.table-handle,\s*\.hybrid-table:focus-within \.table-handle \{[^}]*pointer-events: auto;/,
  );
});

test("add-row and add-column strips do not fade in while already hittable", () => {
  assert.match(css, /\.table-row-btn,\s*\.table-col-btn \{[^}]*opacity: 0;/);
  assert.match(
    css,
    /\.table-row-btn,\s*\.table-col-btn \{[^}]*transition:\s*none;/,
  );
  assert.doesNotMatch(
    css,
    /\.table-row-btn,\s*\.table-col-btn \{[^}]*transition:\s*opacity/,
  );
});

test("row and column grips do not fade in", () => {
  assert.match(css, /\.table-handle \{[^}]*transition:\s*none;/);
  assert.doesNotMatch(css, /\.table-handle \{[^}]*transition:\s*opacity/);
});

test("the cell editor keeps the table's 1.3 line-height so open and closed cells match", () => {
  for (const part of ["cm-scroller", "cm-content", "cm-line"] as const) {
    assert.match(
      css,
      new RegExp(
        `#app \\.hybrid-table \\.cm-editor \\.${part} \\{[^}]*line-height: 1\\.3;`,
      ),
    );
  }
});

test("the cell editor's scroller is content-sized instead of CodeMirror's 100% height", () => {
  assert.match(
    css,
    /#app \.hybrid-table \.cm-editor \.cm-scroller \{[^}]*height: auto;/,
  );
  // No scroll container: see tables-cell-caret.spec.ts for what that keeps.
  assert.match(
    css,
    /#app \.hybrid-table \.cm-editor \.cm-scroller \{[^}]*overflow:\s*visible;/,
  );
});

test("add-strip click inserts only when armed and not dragged (BH-019)", () => {
  assert.equal(
    addStripClickCommits({
      dragged: false,
      opacity: "1",
      focusVisible: false,
    }),
    true,
  );
  assert.equal(
    addStripClickCommits({
      dragged: false,
      opacity: "0",
      focusVisible: true,
    }),
    true,
  );
  assert.equal(
    addStripClickCommits({
      dragged: false,
      opacity: "0",
      focusVisible: false,
    }),
    false,
  );
  assert.equal(
    addStripClickCommits({
      dragged: true,
      opacity: "1",
      focusVisible: false,
    }),
    false,
  );
  assert.equal(
    addStripClickCommits({
      dragged: true,
      opacity: "1",
      focusVisible: true,
    }),
    false,
  );
});
