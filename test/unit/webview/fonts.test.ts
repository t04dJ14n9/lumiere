import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = (path: string) =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

test("note text follows VS Code's editor.fontFamily and editor.fontSize", () => {
  const base = css("src/webview/styles/base.css");
  assert.match(base, /--text-size: var\(--vscode-editor-font-size, 16px\);/);
  assert.match(base, /--text-font: var\(\s*--vscode-editor-font-family,/);
  for (const path of [
    "src/webview/styles/base.css",
    "src/webview/styles/markdown.css",
    "src/plugins/properties/properties.css",
  ]) {
    assert.doesNotMatch(
      css(path),
      /font-size: (?:14|16)px/,
      `${path} sets a fixed text size`,
    );
  }
});
