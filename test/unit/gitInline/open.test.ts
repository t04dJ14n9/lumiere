import test from "node:test";
import assert from "node:assert/strict";
import { shouldOpenInlineHunk } from "../../../src/plugins/gitInline/open";

test("inline open suppressed while selection drag", () => {
  assert.equal(
    shouldOpenInlineHunk({ selectionEmpty: false, interactive: false }),
    false,
  );
});

test("link/checkbox click does not open hunk", () => {
  assert.equal(
    shouldOpenInlineHunk({ selectionEmpty: true, interactive: true }),
    false,
  );
  assert.equal(
    shouldOpenInlineHunk({ selectionEmpty: true, interactive: false }),
    true,
  );
});
