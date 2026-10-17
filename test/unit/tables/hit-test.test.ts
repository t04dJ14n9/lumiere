import test from "node:test";
import assert from "node:assert/strict";
import {
  nearestEntry,
  cellAtPoint,
  cellUnderPoint,
} from "../../../src/plugins/tables/hit-test";

function fakeElement(
  left: number,
  right: number,
  top = 0,
  bottom = 20,
): Element {
  return {
    getBoundingClientRect() {
      return {
        left,
        right,
        top,
        bottom,
        width: right - left,
        height: bottom - top,
        x: left,
        y: top,
        toJSON() {
          return this;
        },
      };
    },
  } as Element;
}

function withDocument(
  elementFromPoint: () => Element | null,
  run: () => void,
): void {
  const previous = globalThis.document;
  Object.defineProperty(globalThis, "document", {
    value: { elementFromPoint },
    configurable: true,
  });
  try {
    run();
  } finally {
    Object.defineProperty(globalThis, "document", {
      value: previous,
      configurable: true,
    });
  }
}

test("nearestEntry picks the closest column when the pointer is past the right edge", () => {
  const cells = [fakeElement(0, 40), fakeElement(40, 80), fakeElement(80, 120)];
  assert.equal(nearestEntry(cells, "column", { x: 60, y: 10 }), 1);
  assert.equal(nearestEntry(cells, "column", { x: 200, y: 10 }), 2);
  assert.equal(nearestEntry(cells, "column", { x: -10, y: 10 }), 0);
});

test("nearestEntry picks the closest row past the bottom edge", () => {
  const rows = [
    fakeElement(0, 100, 0, 20),
    fakeElement(0, 100, 20, 40),
    fakeElement(0, 100, 40, 60),
  ];
  assert.equal(nearestEntry(rows, "row", { x: 10, y: 30 }), 1);
  assert.equal(nearestEntry(rows, "row", { x: 10, y: 90 }), 2);
});

test("cellAtPoint still clamps to the nearest cell past an edge", () => {
  const row0 = {
    cells: [fakeElement(0, 40), fakeElement(40, 80)],
    getBoundingClientRect: () =>
      fakeElement(0, 80, 0, 20).getBoundingClientRect(),
  };
  const row1 = {
    cells: [fakeElement(0, 40, 20, 40), fakeElement(40, 80, 20, 40)],
    getBoundingClientRect: () =>
      fakeElement(0, 80, 20, 40).getBoundingClientRect(),
  };
  const table = { rows: [row0, row1] } as unknown as HTMLTableElement;
  assert.deepEqual(cellAtPoint(table, { x: 60, y: 10 }), {
    row: 0,
    column: 1,
  });
  assert.deepEqual(cellAtPoint(table, { x: 200, y: 100 }), {
    row: 1,
    column: 1,
  });
});

test("cellUnderPoint ignores points that are not over a table cell", () => {
  const cell = {
    dataset: { row: "1", column: "0" },
    getBoundingClientRect() {
      return fakeElement(0, 40, 0, 20).getBoundingClientRect();
    },
    closest(selector: string) {
      if (selector === ".table-handle") {
        return null;
      }
      return /td\[data-row\]|th\[data-row\]/.test(selector) ? this : null;
    },
  };
  const table = {
    contains(node: unknown) {
      return node === cell;
    },
  } as HTMLTableElement;

  withDocument(
    () => cell as unknown as Element,
    () => {
      assert.deepEqual(cellUnderPoint(table, { x: 12, y: 8 }), {
        row: 1,
        column: 0,
      });
    },
  );

  withDocument(
    () => null,
    () => {
      assert.equal(cellUnderPoint(table, { x: 12, y: 8 }), undefined);
    },
  );
});

test("cellUnderPoint ignores a table-handle whose ancestry is a cell outside the cell box", () => {
  // Column grips sit above the header cell (top: -18px) but are appended
  // inside that cell's .table-cell-wrapper, so closest(td/th) would otherwise
  // claim the header cell and convert a native text drag into grid selection.
  const cell = {
    dataset: { row: "0", column: "1" },
    getBoundingClientRect() {
      return fakeElement(40, 80, 20, 40).getBoundingClientRect();
    },
    closest(selector: string) {
      if (selector === ".table-handle") {
        return null;
      }
      return /td\[data-row\]|th\[data-row\]/.test(selector) ? this : null;
    },
  };
  const handle = {
    closest(selector: string) {
      if (selector === ".table-handle") {
        return this;
      }
      return /td\[data-row\]|th\[data-row\]/.test(selector) ? cell : null;
    },
  };
  const table = {
    contains(node: unknown) {
      return node === cell;
    },
  } as HTMLTableElement;

  withDocument(
    () => handle as unknown as Element,
    () => {
      // Point is over the grip, above the cell layout box.
      assert.equal(cellUnderPoint(table, { x: 50, y: 5 }), undefined);
    },
  );
});

test("cellUnderPoint ignores ancestry hits whose point lies outside the cell box", () => {
  const cell = {
    dataset: { row: "0", column: "0" },
    getBoundingClientRect() {
      return fakeElement(0, 40, 20, 40).getBoundingClientRect();
    },
    closest(selector: string) {
      if (selector === ".table-handle") {
        return null;
      }
      return /td\[data-row\]|th\[data-row\]/.test(selector) ? this : null;
    },
  };
  const descendant = {
    closest(selector: string) {
      if (selector === ".table-handle") {
        return null;
      }
      return /td\[data-row\]|th\[data-row\]/.test(selector) ? cell : null;
    },
  };
  const table = {
    contains(node: unknown) {
      return node === cell;
    },
  } as HTMLTableElement;

  withDocument(
    () => descendant as unknown as Element,
    () => {
      assert.equal(cellUnderPoint(table, { x: 10, y: 5 }), undefined);
    },
  );
});
