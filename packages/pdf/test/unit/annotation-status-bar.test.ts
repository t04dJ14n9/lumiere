import assert from "node:assert/strict";
import { test } from "node:test";
import { STATUS_BAR_ORDER } from "../../src/extension/plugins/pdfToolbar/status-bar-layout";

const ANNOTATE_CLUSTER = [
  "annotate",
  "annotationTool",
  "annotationColor",
  "annotationUndo",
  "annotationRedo",
] as const;

test("annotate cluster sits after find and before view", () => {
  const find = STATUS_BAR_ORDER.indexOf("find");
  const view = STATUS_BAR_ORDER.indexOf("view");
  const indexes = ANNOTATE_CLUSTER.map((id) => STATUS_BAR_ORDER.indexOf(id));
  for (const index of indexes) {
    assert.ok(index > find, String(index));
    assert.ok(index < view, String(index));
  }
  const sorted = [...indexes].sort((a, b) => a - b);
  assert.deepEqual(indexes, sorted);
});
