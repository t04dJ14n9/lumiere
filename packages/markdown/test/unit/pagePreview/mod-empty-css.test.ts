import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(
  new URL("../../../src/plugins/pagePreview/pagePreview.css", import.meta.url),
  "utf8",
);

test("pagePreview.css paints Obsidian mod-empty centred muted chrome", () => {
  assert.match(css, /\.link-preview-body\.mod-empty/);
  assert.match(css, /\.popover\.hover-popover\s*>\s*\.mod-empty/);
  assert.match(css, /justify-content:\s*center/);
  assert.match(css, /align-items:\s*center/);
  assert.match(css, /var\(--vscode-descriptionForeground/);
});
