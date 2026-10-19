import assert from "node:assert/strict";
import { test } from "node:test";
import { LookUpTargets } from "../../src/extension/plugins/pdfLookUp/targets";

test("each viewer keeps its own word, which null forgets", () => {
  const targets = new LookUpTargets<object>();
  const [a, b] = [{}, {}];
  targets.record(a, "attention");
  targets.record(b, "transformer");
  assert.equal(targets.word(a), "attention");
  assert.equal(targets.word(b), "transformer");
  targets.record(a, null);
  assert.equal(targets.word(a), undefined);
  assert.equal(targets.word(b), "transformer");
  assert.equal(targets.word(undefined), undefined);
});
