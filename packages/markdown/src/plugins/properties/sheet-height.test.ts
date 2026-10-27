import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = new URL("../../..", import.meta.url).pathname;
const css = readFileSync(
  path.join(root, "src/plugins/properties/properties.css"),
  "utf8",
).replace(/\s+/g, " ");

test("the sheet's wrapper keeps the sheet's bottom margin, so its measured height counts it", () => {
  // Collapsed through the wrapper, the 2rem margin was missing from the
  // height map: every line number below the sheet sat 32 px off its line.
  assert.match(css, /\.properties \{[^}]*margin-block-end: 2rem;/);
  assert.match(css, /\.hybrid-properties \{[^}]*display: flow-root;/);
});
