import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = new URL("../../..", import.meta.url).pathname;
const css = readFileSync(
  path.join(root, "src/plugins/properties/properties.css"),
  "utf8",
).replace(/\s+/g, " ");

test("mod-unknown uses Obsidian metadata-input-padding 4px 8px", () => {
  const rule =
    /\.metadata-property-value \.mod-unknown \{([^}]*)\}/.exec(css)?.[1] ?? "";
  assert.match(rule, /padding:\s*4px 8px;/);
  assert.match(rule, /box-sizing:\s*border-box;/);
  assert.match(rule, /white-space:\s*nowrap;/);
});
