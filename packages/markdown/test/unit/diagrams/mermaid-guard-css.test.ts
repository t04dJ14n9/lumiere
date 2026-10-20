import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(
  new URL("../../../src/plugins/diagrams/diagrams.css", import.meta.url),
  "utf8",
);

function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `${selector} present`);
  return css.slice(start, css.indexOf("}", start));
}

test("diagrams.css paints Obsidian is-guarded chrome with VS Code tokens", () => {
  assert.match(rule(".mermaid-wrapper.is-guarded"), /border:/);
  assert.match(rule(".mermaid-wrapper.is-guarded"), /border-radius:\s*6px/);
  assert.match(rule(".mermaid-guard-title"), /font-weight:\s*600/);
  assert.match(
    rule(".mermaid-guard-description"),
    /var\(--vscode-descriptionForeground/,
  );
  assert.match(rule(".mermaid-guard-source"), /border-top:/);
  assert.match(
    rule(".mermaid-guard-source pre"),
    /var\(--vscode-textCodeBlock-background/,
  );
  assert.doesNotMatch(css, /\.diagram-error/);
});
