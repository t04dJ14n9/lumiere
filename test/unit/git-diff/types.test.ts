import test from "node:test";
import assert from "node:assert/strict";
import type { DiffSnapshot } from "../../../src/shared/git-diff";

test("DiffSnapshot requires fileUri even without liveDocumentUri", () => {
  const snap: DiffSnapshot = {
    generationId: "g1",
    repository: "file:///repo",
    fileUri: "file:///repo/note.md",
    base: { kind: "HEAD", oid: "abc" },
    target: { kind: "INDEX", fingerprint: "idx1" },
    sourceState: {
      baseOidOrFingerprint: "abc",
      targetOidOrFingerprint: "idx1",
    },
    hunks: [],
    computedAt: 0,
  };
  assert.equal(snap.liveDocumentUri, undefined);
  assert.equal(snap.fileUri.endsWith("note.md"), true);
});
