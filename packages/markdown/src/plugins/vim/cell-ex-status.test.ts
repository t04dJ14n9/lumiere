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

test("restore clears an orphaned dialog from the shared outer bar", () => {
  const dialog = { tag: "dialog" } as unknown as HTMLElement;
  const host = {
    tag: "host",
    contains(node: Node) {
      return node === (dialog as unknown as Node);
    },
    textContent: "stale",
  } as unknown as HTMLElement;
  let outerRepaints = 0;
  const cell: Adapter & {
    state: { dialog?: HTMLElement | null; statusbar?: HTMLElement | null };
  } = { state: { dialog } };
  const outer = {
    state: {
      statusbar: host,
      vimPlugin: { updateStatus: () => outerRepaints++ },
    },
  };
  const restore = proxyCellExDialogToOuterStatus(cell as never, outer as never);
  assert.equal(cell.state.statusbar, host);
  restore();
  assert.equal(host.textContent, "");
  assert.equal(outerRepaints, 1);
  assert.equal(cell.state.statusbar, undefined);
});
