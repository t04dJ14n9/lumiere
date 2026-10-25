import test from "node:test";
import assert from "node:assert/strict";
import { menuContext, menuHasSelection } from "./menu-context";

test("a word the browser selected on a macOS secondary click counts before CodeMirror reads it", () => {
  assert.equal(
    menuHasSelection({ isInContent: true, isCollapsed: false }, true),
    true,
  );
});

test("Vim character-visual: CodeMirror's range counts when the DOM caret is collapsed (BH-048)", () => {
  assert.equal(
    menuHasSelection({ isInContent: true, isCollapsed: true }, false),
    true,
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
  assert.equal(
    menuHasSelection({ isInContent: true, isCollapsed: true }, true),
    false,
  );
});

test("the menu context shadows the global selection key", () => {
  assert.deepEqual(JSON.parse(menuContext(true)), {
    webviewSection: "markdownContent",
    "lumiere.markdown.hasSelection": true,
  });
  assert.deepEqual(JSON.parse(menuContext(false)), {
    webviewSection: "markdownContent",
    "lumiere.markdown.hasSelection": false,
  });
});
