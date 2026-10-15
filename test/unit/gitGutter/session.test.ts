import test from "node:test";
import assert from "node:assert/strict";
import { DiffSession } from "../../../src/plugins/gitGutter/session";
import type { DocHunk } from "../../../src/plugins/gitGutter/api";

test("a mapped bar still resolves the same snapshot hunk", () => {
  const session = new DiffSession("HEAD");
  const snapshot = session.publish("live-document", "a\n\nold\n", "b\n\nnew\n");
  const second = snapshot.hunks[1];
  assert.ok(second?.liveAnchor);
  const mapped: DocHunk = {
    kind: "modified",
    from: second.liveAnchor.from + 1,
    to: second.liveAnchor.to + 1,
    old: "old",
    oldLine: second.originalRange.startLine + 1,
    atEnd: false,
  };
  assert.equal(session.refFor(mapped)?.hunkId, second.hunkId);
  assert.ok(session.linesFor(mapped).some((line) => line.text === "old"));
});

test("a shifted bar with different baseline text does not match", () => {
  const session = new DiffSession("HEAD");
  session.publish("live-document", "a\n\nold\n", "b\n\nnew\n");
  const other: DocHunk = {
    kind: "modified",
    from: 99,
    to: 102,
    old: "elsewhere",
    oldLine: 3,
    atEnd: false,
  };
  assert.equal(session.refFor(other), undefined);
});
