import assert from "node:assert/strict";
import { test } from "node:test";
import { parseViewerMessage } from "../../src/shared/messages";

test("parseViewerMessage accepts annotationSave with ArrayBuffer", () => {
  const data = new Uint8Array([1, 2, 3]).buffer;
  const parsed = parseViewerMessage({
    type: "annotationSave",
    load: 2,
    baseSha256: "abc",
    data,
  });
  assert.equal(parsed?.type, "annotationSave");
  if (parsed?.type === "annotationSave") {
    assert.equal(parsed.load, 2);
    assert.equal(parsed.baseSha256, "abc");
    assert.equal(parsed.data.byteLength, 3);
  }
});

test("parseViewerMessage rejects annotationSave without hash", () => {
  assert.equal(
    parseViewerMessage({
      type: "annotationSave",
      load: 1,
      data: new ArrayBuffer(1),
    }),
    undefined,
  );
});
