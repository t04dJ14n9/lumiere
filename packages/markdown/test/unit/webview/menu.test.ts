import test from "node:test";
import assert from "node:assert/strict";
import { menuFocusIndex } from "../../../src/webview/ui/menu";

test("menu navigation wraps enabled choices and reserves submenu/dismissal keys", () => {
  assert.equal(menuFocusIndex("ArrowDown", 2, 3), 0);
  assert.equal(menuFocusIndex("ArrowUp", 0, 3), 2);
  assert.equal(menuFocusIndex("ArrowDown", -1, 3), 0);
  assert.equal(menuFocusIndex("Home", 1, 3), 0);
  assert.equal(menuFocusIndex("End", 0, 3), 2);
  for (const key of ["ArrowLeft", "ArrowRight", "Escape", "Tab", "Enter"]) {
    assert.equal(menuFocusIndex(key, 0, 3), undefined);
  }
  assert.ok(Number.isNaN(menuFocusIndex("ArrowDown", -1, 0)));
});
