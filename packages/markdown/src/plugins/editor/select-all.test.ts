import test from "node:test";
import assert from "node:assert/strict";
import { isHandledSelectAll, type SelectAllKey } from "./select-all";

const key = (overrides: Partial<SelectAllKey>): SelectAllKey => ({
  key: "a",
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  defaultPrevented: true,
  ...overrides,
});

test("a Select All the editor handled stops before VS Code selects the page", () => {
  assert.equal(isHandledSelectAll(key({ ctrlKey: true }), false), true);
  assert.equal(isHandledSelectAll(key({ metaKey: true }), true), true);
  assert.equal(
    isHandledSelectAll(key({ ctrlKey: true, key: "A" }), false),
    true,
  );
});

test("unhandled keys and other shortcuts still reach VS Code", () => {
  // A text box leaves Ctrl+A to VS Code, which selects the box's text.
  assert.equal(
    isHandledSelectAll(key({ ctrlKey: true, defaultPrevented: false }), false),
    false,
  );
  assert.equal(
    isHandledSelectAll(key({ ctrlKey: true, shiftKey: true }), false),
    false,
  );
  assert.equal(
    isHandledSelectAll(key({ ctrlKey: true, altKey: true }), false),
    false,
  );
  assert.equal(isHandledSelectAll(key({ metaKey: true }), false), false);
  assert.equal(isHandledSelectAll(key({ ctrlKey: true }), true), false);
  assert.equal(
    isHandledSelectAll(key({ ctrlKey: true, key: "b" }), false),
    false,
  );
});
