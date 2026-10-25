import test from "node:test";
import assert from "node:assert/strict";
import {
  clickSearches,
  tagFromEventTarget,
} from "../../../src/plugins/tags/webview";

test("as in Obsidian, a click on a tag searches for it; a Shift-click or a drag only selects", () => {
  const click = { button: 0, shiftKey: false };
  assert.equal(clickSearches(click, true, "tag"), true);
  assert.equal(clickSearches(click, true, "a/b"), true);
  assert.equal(clickSearches({ ...click, shiftKey: true }, true, "tag"), false);
  assert.equal(clickSearches({ ...click, button: 1 }, true, "tag"), false);
  // A drag that ends on the tag leaves a selection (or moves past the threshold).
  assert.equal(clickSearches(click, false, "tag"), false);
  assert.equal(clickSearches(click, true, undefined), false);
  assert.equal(clickSearches(click, true, "123"), false);
});

test("tagFromEventTarget ignores non-elements and unknown nodes (BH-050)", () => {
  assert.equal(tagFromEventTarget(null), undefined);
  assert.equal(tagFromEventTarget({} as EventTarget), undefined);
});
