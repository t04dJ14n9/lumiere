// What the worker and the window send each other is parsed on arrival.
import test from "node:test";
import assert from "node:assert/strict";
import { parseAnswer, parseQuestion } from "../../src/shared/messages";

test("questions are a page by id, or a file by panel and URI", () => {
  assert.deepEqual(parseQuestion({ lumiere: "page", id: "p1" }), {
    lumiere: "page",
    id: "p1",
  });
  assert.deepEqual(
    parseQuestion({
      lumiere: "file",
      panel: "p1",
      uri: "file:///vaults/a.png",
      extra: 1,
    }),
    { lumiere: "file", panel: "p1", uri: "file:///vaults/a.png" },
  );
  assert.equal(parseQuestion({ lumiere: "file", panel: "p1" }), undefined);
  assert.equal(parseQuestion({ lumiere: "file", uri: "file:///a" }), undefined);
  assert.equal(parseQuestion({ lumiere: "read", id: "p1" }), undefined);
  assert.equal(parseQuestion(null), undefined);
});

test("a file comes as a Blob; refusals and absences as their kind alone", () => {
  const file = new Blob(["png"]);
  assert.deepEqual(parseAnswer({ kind: "file", file }), { kind: "file", file });
  assert.equal(parseAnswer({ kind: "file", file: "png" }), undefined);
  assert.equal(
    parseAnswer({ kind: "file", file: new Uint8Array(3) }),
    undefined,
  );
  for (const kind of ["refused", "missing", "unknown"] as const) {
    assert.deepEqual(parseAnswer({ kind, file }), { kind });
  }
  assert.equal(parseAnswer({ kind: "page" }), undefined);
  assert.equal(parseAnswer({ kind: "allowed" }), undefined);
  assert.equal(parseAnswer("file"), undefined);
});
