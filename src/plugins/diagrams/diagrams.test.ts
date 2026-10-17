import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { diagramLanguage } from "./webview";
test("diagrams claim only the Mermaid fence language", () => {
  assert.equal(diagramLanguage(" mermaid title"), true);
  assert.equal(diagramLanguage("MERMAID"), true);
  assert.equal(diagramLanguage("mermaid-extra"), false);
  assert.equal(diagramLanguage("javascript"), false);
});

test("diagrams reveal source on double-click, not single-click", () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(dir, "webview.ts"), "utf8");
  assert.match(src, /new MarkdownBlock\(block, ctx\.render, "dblclick"\)/);
});

