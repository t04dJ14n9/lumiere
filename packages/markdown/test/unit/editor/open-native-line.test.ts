import assert from "node:assert/strict";
import test from "node:test";
import { lineSelection } from "../../../src/host/open-native-line";

test("lineSelection selects full inclusive lines like Open Copied Agent Reference", () => {
  const source = "# Title\nSecond line here\nThird\n";
  assert.deepEqual(lineSelection(source, { startLine: 2, endLine: 2 }), {
    at: source.indexOf("Second"),
    to: source.indexOf("Second") + "Second line here".length,
  });
  assert.deepEqual(lineSelection(source, { startLine: 2, endLine: 3 }), {
    at: source.indexOf("Second"),
    to: source.indexOf("Third") + "Third".length,
  });
});

test("lineSelection refuses ranges past the document", () => {
  assert.equal(
    lineSelection("one\ntwo\n", { startLine: 1, endLine: 9 }),
    undefined,
  );
});
