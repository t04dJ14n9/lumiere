import test from "node:test";
import assert from "node:assert/strict";
import { menuContext, menuHasSelection } from "./menu-context";

test("a word the browser selected on a macOS secondary click counts before CodeMirror reads it", () => {
  assert.equal(
    menuHasSelection({ isInContent: true, isCollapsed: false }, true),
    true,
  );
});

test("the browser's caret in the content wins over a stale CodeMirror range", () => {
  assert.equal(
    menuHasSelection({ isInContent: true, isCollapsed: true }, false),
    false,
  );
});

test("without a browser selection in the content, CodeMirror's selection decides", () => {
  assert.equal(menuHasSelection(null, false), true);
  assert.equal(menuHasSelection(null, true), false);
  assert.equal(
    menuHasSelection({ isInContent: false, isCollapsed: false }, true),
    false,
  );
  assert.equal(
    menuHasSelection({ isInContent: false, isCollapsed: true }, false),
    true,
  );
});

test("the menu context shadows the global selection key", () => {
  assert.deepEqual(JSON.parse(menuContext(true)), {
    "lumiere.markdown.hasSelection": true,
  });
  assert.deepEqual(JSON.parse(menuContext(false)), {
    "lumiere.markdown.hasSelection": false,
  });
});
