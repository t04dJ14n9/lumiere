import test from "node:test";
import assert from "node:assert/strict";
import {
  parseTable,
  type CellPosition,
  type CellRange,
} from "../../markdown/tables/model";
import { initialCellSelection } from "./cell-editor";
import { TableKeyboard } from "./keyboard";
import type { TableGrid } from "./grid";
import type { CellProjection } from "./projection";
import type { TableSelection } from "./selection";

function gridKeyboardFixture(range: CellRange, cursor?: number) {
  const model = parseTable("| abcdef | z |\n|---|---|\n| next | last |")!;
  const opened: {
    position: CellPosition;
    offset: number | "all" | undefined;
  }[] = [];
  const selection = {
    range: range as CellRange | undefined,
    gridCursor: cursor,
    select(next: CellRange) {
      this.range = next;
    },
  } as TableSelection;
  const projection = {
    open(position: CellPosition, offset?: number | "all") {
      opened.push({ position, offset });
      delete selection.range;
    },
  } as unknown as CellProjection;
  const grid = {
    model,
    root: { focus() {} },
    cells: model.rows.map((row) => row.map(() => ({ scrollIntoView() {} }))),
  } as unknown as TableGrid;
  const keyboard = new TableKeyboard(grid, projection, selection, {
    request() {},
    deactivate() {},
    menu() {},
  });
  return { keyboard, model, selection, opened };
}

const left = { row: 0, column: 0 };
const right = { row: 0, column: 1 };

test("collapsing a rectangle saves the target cell's directional caret offset", () => {
  for (const reversed of [false, true]) {
    for (const step of [
      { row: 0, column: -1 },
      { row: -1, column: 0 },
      { row: 0, column: 1 },
      { row: 1, column: 0 },
    ]) {
      const fixture = gridKeyboardFixture(
        { anchor: reversed ? right : left, head: reversed ? left : right },
        6,
      );
      fixture.keyboard.arrow(step, false);
      const backward = step.row < 0 || step.column < 0;
      const target = backward ? left : right;
      assert.deepEqual(fixture.selection.range, {
        anchor: target,
        head: target,
      });
      assert.equal(fixture.selection.gridCursor, backward ? 0 : 1);
      assert.deepEqual(fixture.opened, []);
    }
  }
});

test("saved grid offsets are clamped when extending back to an edited anchor cell", () => {
  for (const cursor of [-2, 0, 1, 6, undefined]) {
    const fixture = gridKeyboardFixture({ anchor: right, head: left }, cursor);
    // Simulate an intervening source edit that shortened the anchor cell.
    fixture.model.rows[0]![1]!.text = "";
    fixture.keyboard.arrow({ row: 0, column: 1 }, true);
    assert.deepEqual(fixture.opened, [{ position: right, offset: 0 }]);
  }
});

test("returning to a forward-collapsed anchor opens at the shorter cell's end", () => {
  const fixture = gridKeyboardFixture({ anchor: left, head: right }, 6);
  fixture.keyboard.arrow({ row: 0, column: 1 }, false);
  fixture.keyboard.arrow({ row: 0, column: -1 }, true);
  fixture.keyboard.arrow({ row: 0, column: 1 }, true);
  assert.deepEqual(fixture.opened, [{ position: right, offset: 1 }]);
});

test("initialCellSelection keeps normal-mode Vim carets collapsed and on the last cluster", () => {
  assert.deepEqual(initialCellSelection("alpha", "all", true), {
    anchor: 0,
    head: 0,
  });
  assert.deepEqual(initialCellSelection("alpha", "all", false), {
    anchor: 0,
    head: 5,
  });
  assert.deepEqual(initialCellSelection("区域", undefined, true), {
    anchor: 1,
    head: 1,
  });
  assert.deepEqual(initialCellSelection("A", undefined, true), {
    anchor: 0,
    head: 0,
  });
  assert.deepEqual(initialCellSelection("😀", undefined, true), {
    anchor: 0,
    head: 0,
  });
});
