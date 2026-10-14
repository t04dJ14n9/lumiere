import test from "node:test";
import assert from "node:assert/strict";
import { sourceRows } from "../../../src/markdown/okf/sources";

test("rows keep document order and do not invent citation ids", () => {
  const rows = sourceRows(
    [
      { resource: "https://example.com/a", title: "A" },
      { id: "cited", resource: "/metrics/topic.md", usage_count: 0 },
    ],
    {},
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.id, undefined);
  assert.equal(rows[0]?.title, "A");
  assert.equal(rows[0]?.resource, "https://example.com/a");
  assert.equal(rows[1]?.id, "cited");
  assert.equal(rows[1]?.usageCount, 0);
  assert.equal(rows[1]?.usageAbsent, false);
});

test("absent usage is distinct from zero and the window can be inherited", () => {
  const rows = sourceRows([{ resource: "notes/a.md" }], {
    usage_window: "30d",
  });
  assert.equal(rows[0]?.usageCount, undefined);
  assert.equal(rows[0]?.usageAbsent, true);
  assert.equal(rows[0]?.usageWindow, "30d");
  assert.equal(rows[0]?.usageInherited, true);
});

test("malformed entries stay inspectable", () => {
  const rows = sourceRows(
    ["not-a-record", { resource: 3, extra: { n: 1 } }],
    {},
  );
  assert.equal(rows.length, 2);
  assert.match(rows[0]?.raw ?? "", /not-a-record/);
  assert.match(rows[1]?.raw ?? "", /extra/);
  assert.equal(rows[1]?.navigable, false);
});
