import test from "node:test";
import assert from "node:assert/strict";
import { cellNavKey } from "./navigation";

/** BH-039: Tab / Enter map to cell hops before Vim can swallow them. */
test("cellNavKey maps Tab, Shift+Tab, Enter and Shift+Enter (BH-039)", () => {
  assert.deepEqual(cellNavKey({ key: "Tab", shiftKey: false }), {
    row: 0,
    column: 1,
  });
  assert.deepEqual(cellNavKey({ key: "Tab", shiftKey: true }), {
    row: 0,
    column: -1,
  });
  assert.deepEqual(cellNavKey({ key: "Enter", shiftKey: false }), {
    row: 1,
    column: 0,
  });
  assert.equal(cellNavKey({ key: "Enter", shiftKey: true }), "br");
  assert.equal(cellNavKey({ key: "Tab", shiftKey: false, ctrlKey: true }), undefined);
  assert.equal(cellNavKey({ key: "a", shiftKey: false }), undefined);
});
