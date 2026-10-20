import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = new URL("../../..", import.meta.url).pathname;
const css = readFileSync(
  path.join(root, "src/plugins/properties/properties.css"),
  "utf8",
).replace(/\s+/g, " ");

test("multi-select-pill matches Obsidian REA pill chrome", () => {
  const rule =
    /\.property-list \.multi-select-pill \{([^}]*)\}/.exec(css)?.[1] ?? "";
  assert.match(rule, /border:\s*1px solid/);
  assert.match(rule, /border-radius:\s*2em;/);
  assert.match(rule, /padding:\s*0\.25em 0;/);
  assert.match(rule, /background:\s*transparent;/);
  assert.match(rule, /line-height:\s*1;/);
});

test("pill content and remove use Obsidian --pill-padding-x margins", () => {
  const content =
    /\.property-list \.multi-select-pill-content \{([^}]*)\}/.exec(css)?.[1] ??
    "";
  assert.match(content, /margin-inline-start:\s*0\.65em;/);
  const remove =
    /\.property-list \.multi-select-pill-remove-button,\s*\.property-list button\[data-property-remove\] \{([^}]*)\}/.exec(
      css,
    )?.[1] ?? "";
  assert.match(remove, /margin-inline-end:\s*0\.65em;/);
});

test("pill focus-visible uses Obsidian inset focus ring via ::after", () => {
  const after =
    /\.property-list \.multi-select-pill:focus-visible::after \{([^}]*)\}/.exec(
      css,
    )?.[1] ?? "";
  assert.match(after, /inset:\s*-2px;/);
  assert.match(after, /box-shadow:/);
});
