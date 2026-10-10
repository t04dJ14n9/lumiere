import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const root = new URL("../../../", import.meta.url).pathname;
const css = (file: string) => readFileSync(path.join(root, file), "utf8");

function stylesheets(directory: string): string[] {
  return readdirSync(path.join(root, directory), { withFileTypes: true })
    .flatMap((entry) => {
      const relative = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return stylesheets(relative);
      }
      return relative.endsWith(".css") ? [relative] : [];
    })
    .sort();
}

/**
 * Editor chrome that is not note text and keeps VS Code's widget sizes: the
 * find bar, the suggestion popup and the sync status toast.
 */
const CHROME = [
  "src/plugins/editor/find.css",
  "src/plugins/suggest/suggest.css",
  "src/webview/styles/base.css",
];

test("the note's size is one variable, markdownWorkbench.editor.fontSize, not editor.fontSize", () => {
  const base = css("src/webview/styles/base.css");
  assert.match(base, /--text-size: 16px;/);
  assert.match(base, /--text-font: var\(\s*--vscode-editor-font-family,/);
  assert.doesNotMatch(base, /--vscode-editor-font-size/);
  for (const file of stylesheets("src")) {
    assert.doesNotMatch(css(file), /--vscode-editor-font-size/, file);
  }
});

test("every size in the note is em- or variable-relative, so it scales with the setting", () => {
  for (const file of stylesheets("src")) {
    if (CHROME.includes(file)) {
      continue;
    }
    const text = css(file).replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(
      text,
      /font-size:\s*[\d.]+px/,
      `${file} sets a px size`,
    );
    assert.doesNotMatch(
      text,
      /line-height:\s*[\d.]+px/,
      `${file} sets a px line height`,
    );
  }
  // The only px size in the base stylesheet is chrome (the sync toast).
  const base = css("src/webview/styles/base.css").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );
  assert.deepEqual(base.match(/font-size:\s*[\d.]+px/g), ["font-size: 12px"]);
});
