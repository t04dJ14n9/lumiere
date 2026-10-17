import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(
  new URL("../../../src/plugins/callouts/callouts.css", import.meta.url),
  "utf8",
);

test("callouts have Obsidian's padding and a line's space around the body", () => {
  // Measured in Obsidian: 101px for a title and a one-line body at 16px.
  assert.match(css, /\.callout \{[^}]*padding: 12px 12px 12px 24px;/);
  assert.match(css, /\.callout-title \{[^}]*line-height: 1\.3;/);
  assert.match(css, /\.callout-content > :first-child \{\s*margin-top: 1em;/);
  assert.match(css, /\.callout-content > :last-child \{\s*margin-bottom: 1em;/);
});
