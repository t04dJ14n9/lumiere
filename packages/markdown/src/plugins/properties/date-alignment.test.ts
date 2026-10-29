// WebKit on the iPad centres the value of a date or date-time field, so a
// property's date sat far to the right of its other values.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const css = readFileSync(
  path.join(import.meta.dirname, "properties.css"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

test("a date property's value starts at the left, as its other values do", () => {
  const rule = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].find(([, head]) =>
    head!.includes("::-webkit-date-and-time-value"),
  );
  assert.ok(rule, "a rule for the date field's value");
  assert.match(
    rule[1]!,
    /\.metadata-property-value\s+input\[data-property-input\]/,
  );
  assert.match(rule[2]!, /text-align:\s*start/);
});
