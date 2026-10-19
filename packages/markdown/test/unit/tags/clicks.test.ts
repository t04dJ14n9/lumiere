import test from "node:test";
import assert from "node:assert/strict";
import { clickSearches } from "../../../src/plugins/tags/webview";

test("as in Obsidian, a click on a tag searches for it; a Shift-click or a drag only selects", () => {
  const click = { button: 0, shiftKey: false };
  assert.equal(clickSearches(click, true, "tag"), true);
  assert.equal(clickSearches(click, true, "a/b"), true);
  assert.equal(clickSearches({ ...click, shiftKey: true }, true, "tag"), false);
  assert.equal(clickSearches({ ...click, button: 1 }, true, "tag"), false);
  // A drag that ends on the tag leaves a selection.
  assert.equal(clickSearches(click, false, "tag"), false);
  assert.equal(clickSearches(click, true, undefined), false);
  assert.equal(clickSearches(click, true, "123"), false);
});
