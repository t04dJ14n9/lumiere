import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(
  new URL("../../../src/plugins/callouts/callouts.css", import.meta.url),
  "utf8",
);

test("callouts have Obsidian's roomy padding and gap under the title", () => {
  assert.match(css, /\.callout \{[^}]*padding: 12px 12px 12px 24px;/);
  assert.match(css, /\.callout-content > :first-child \{\s*margin-top: 12px;/);
});
