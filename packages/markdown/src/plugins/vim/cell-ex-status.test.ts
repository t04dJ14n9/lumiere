import assert from "node:assert/strict";
import test from "node:test";
import { proxyCellExDialogToOuterStatus } from "./cell-ex-status";

type Adapter = { state: { statusbar?: HTMLElement | null } };

test("assigns outer statusbar onto the cell adapter", () => {
  const host = { tag: "host" } as unknown as HTMLElement;
  const cell: Adapter = { state: {} };
  const outer: Adapter = { state: { statusbar: host } };
  const restore = proxyCellExDialogToOuterStatus(cell, outer);
  assert.equal(cell.state.statusbar, host);
  restore();
  assert.equal(cell.state.statusbar, undefined);
});

test("no-ops when outer has no statusbar", () => {
  const cell: Adapter = { state: {} };
  const restore = proxyCellExDialogToOuterStatus(cell, { state: {} });
  assert.equal(cell.state.statusbar, undefined);
  restore();
});

test("restore leaves a newer statusbar assignment alone", () => {
  const host = { tag: "host" } as unknown as HTMLElement;
  const other = { tag: "other" } as unknown as HTMLElement;
  const cell: Adapter = { state: {} };
  const restore = proxyCellExDialogToOuterStatus(cell, {
    state: { statusbar: host },
  });
  cell.state.statusbar = other;
  restore();
  assert.equal(cell.state.statusbar, other);
});
