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
  assert.match(rule(".mermaid-wrapper.is-guarded"), /border-radius:\s*8px/);
  assert.match(rule(".mermaid-guard-title"), /font-weight:\s*600/);
  assert.match(rule(".mermaid-guard-title"), /font-size:\s*13px/);
  assert.match(
    rule(".mermaid-guard-description"),
    /var\(--vscode-descriptionForeground/,
  );
  assert.match(rule(".mermaid-guard-description"), /font-size:\s*12px/);
  assert.match(rule(".mermaid-guard-source"), /border-top:/);
  assert.match(
    rule(".mermaid-guard-source pre"),
    /var\(--vscode-textCodeBlock-background/,
  );
  assert.doesNotMatch(css, /\.diagram-error/);
});

test("diagrams.css styles Obsidian mermaid-guard-actions Allow control", () => {
  assert.match(rule(".mermaid-guard-actions"), /display:\s*flex/);
  assert.match(rule(".mermaid-guard-actions button"), /cursor:\s*pointer/);
});

test("diagrams.css styles Mermaid internal-link nodes with pointer cursor", () => {
  assert.match(
    rule('pre[data-fence="mermaid"] svg .internal-link tspan'),
    /cursor:\s*pointer/,
  );
});

test("diagrams.css Mermaid host has Obsidian LP padding 0 (no reserved badge band)", () => {
  assert.match(rule('pre[data-fence="mermaid"]:has(> svg)'), /padding:\s*0;/);
  assert.match(
    rule('pre[data-fence="mermaid"]:has(> svg)'),
    /text-align:\s*start/,
  );
});
