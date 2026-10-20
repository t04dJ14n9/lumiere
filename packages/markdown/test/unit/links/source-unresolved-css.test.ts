import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(
  new URL("../../../src/plugins/links/links.css", import.meta.url),
  "utf8",
);

test("source-mode unresolved links use Obsidian-like dotted underline dimming", () => {
  const start = css.indexOf(".cm-editor.is-source-mode .is-unresolved {");
  assert.ok(start >= 0, "source-mode unresolved rule present");
  const block = css.slice(start, css.indexOf("}", start));
  assert.match(block, /opacity:\s*0\.7/);
  assert.match(block, /text-decoration-style:\s*dotted/);
  assert.match(block, /var\(--vscode-textLink-foreground/);
});
