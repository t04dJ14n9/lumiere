import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { POPOVER_HEIGHT } from "../../../src/plugins/pagePreview/popup";

const css = readFileSync(
  new URL("../../../src/plugins/pagePreview/pagePreview.css", import.meta.url),
  "utf8",
);

test("page preview matches Obsidian hover-popover 450×400 with VS Code colours", () => {
  assert.equal(POPOVER_HEIGHT, 400);
  const start = css.indexOf(".link-preview,\n.popover.hover-popover {");
  assert.ok(start >= 0, "Obsidian class alias shared with link-preview");
  const block = css.slice(start, css.indexOf("}", start));
  assert.match(block, /--popover-width:\s*450px/);
  assert.match(block, /--popover-height:\s*400px/);
  assert.match(block, /width:\s*min\(var\(--popover-width\)/);
  assert.match(block, /max-height:\s*min\(var\(--popover-height\)/);
  assert.match(block, /var\(--vscode-editorHoverWidget-background/);
  assert.doesNotMatch(block, /width:\s*min\(440px/);
  assert.doesNotMatch(block, /max-height:\s*340px/);
});
