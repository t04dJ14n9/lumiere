import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = new URL("../../..", import.meta.url).pathname;
const css = readFileSync(
  path.join(root, "src/plugins/callouts/callouts.css"),
  "utf8",
).replace(/\s+/g, " ");

test("callout title matches Obsidian flex-start and 4px gap", () => {
  const rule = /\.callout-title \{([^}]*)\}/.exec(css)?.[1] ?? "";
  assert.match(rule, /align-items:\s*flex-start;/);
  assert.match(rule, /gap:\s*4px;/);
  assert.match(rule, /line-height:\s*1\.3;/);
});

test("callout icon flex-centers against multi-line titles", () => {
  const rule = /\.callout-icon \{([^}]*)\}/.exec(css)?.[1] ?? "";
  assert.match(rule, /display:\s*flex;/);
  assert.match(rule, /align-items:\s*center;/);
});


test("Live Preview zeros outer callout margin; nested keep 1em", () => {
  assert.match(css, /\.hybrid-callout \.callout \{[^}]*margin:\s*0;/);
  const nested =
    /\.hybrid-callout \.callout-content \.callout,\s*\.callout-content \.callout \{([^}]*)\}/.exec(
      css,
    )?.[1] ?? "";
  assert.match(nested, /margin:\s*1em 0;/);
});
