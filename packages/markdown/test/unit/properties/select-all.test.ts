import test from "node:test";
import assert from "node:assert/strict";
import { isSelectAll } from "../../../src/plugins/properties/select-all";

const key = (
  keys: Partial<Record<"ctrlKey" | "metaKey" | "altKey" | "shiftKey", boolean>>,
  name = "a",
) => ({
  key: name,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...keys,
});

test("Select All is Cmd+A on macOS and Ctrl+A elsewhere, without other modifiers", () => {
  assert.equal(isSelectAll(key({ metaKey: true }), true), true);
  assert.equal(isSelectAll(key({ metaKey: true }, "A"), true), true);
  // On macOS, Ctrl+A moves to the line start.
  assert.equal(isSelectAll(key({ ctrlKey: true }), true), false);
  assert.equal(isSelectAll(key({ ctrlKey: true }), false), true);
  assert.equal(isSelectAll(key({ metaKey: true }), false), false);
  assert.equal(
    isSelectAll(key({ metaKey: true, shiftKey: true }), true),
    false,
  );
  assert.equal(isSelectAll(key({ metaKey: true, altKey: true }), true), false);
  assert.equal(isSelectAll(key({ metaKey: true }, "b"), true), false);
});
