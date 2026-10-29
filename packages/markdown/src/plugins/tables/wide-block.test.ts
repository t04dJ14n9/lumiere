import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "tables.css"),
  "utf8",
);

test("table-scroll uses overflow-x auto", () => {
  const rule = css.match(/\.table-scroll\s*\{[^}]*\}/)?.[0];
  assert.ok(rule);
  assert.match(rule, /overflow-x\s*:\s*auto/);
});

test("table-wrapper is max-content width (no shrink-to-fit)", () => {
  const rule = css.match(/\.table-wrapper\s*\{[^}]*\}/)?.[0];
  assert.ok(rule);
  assert.match(rule, /width\s*:\s*max-content/);
});
