import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import {
  computeHunks,
  hunkField,
  setHunks,
} from "../../../src/plugins/gitGutter/hunks";
import { DiffSession } from "../../../src/plugins/gitGutter/session";
import type { DocHunk, GitDiff } from "../../../src/plugins/gitGutter/api";
import {
  showDiffOpenAt,
  shouldOpenInlineHunk,
} from "../../../src/plugins/gitInline/open";

test("inline open suppressed while selection drag", () => {
  assert.equal(
    shouldOpenInlineHunk({ selectionEmpty: false, interactive: false }),
    false,
  );
});

test("Show Diff opens the mapped hunk, not the stale snapshot anchor", () => {
  const baseline = "a\n\nold\n";
  const session = new DiffSession("HEAD");
  const snap = session.publish("live-document", baseline, "b\n\nnew\n");
  let state = EditorState.create({
    doc: "b\n\nnew\n",
    extensions: [hunkField],
  });
  state = state.update({
    effects: setHunks.of(computeHunks(baseline, state.doc)),
  }).state;
  const built = state.field(hunkField).hunks[1];
  assert.ok(built);
  const ref = session.refFor(built);
  const anchor = snap.hunks[1]?.liveAnchor?.from;
  assert.ok(ref);
  assert.equal(typeof anchor, "number");
  state = state.update({ changes: { from: 0, insert: "X" } }).state;
  const diff = {
    field: hunkField,
    refFor: (hunk: DocHunk) => session.refFor(hunk),
  } as GitDiff;
  const opened = showDiffOpenAt(state, diff, built, ref);
  assert.ok(opened);
  assert.equal(opened.at, built.from + 1);
  assert.notEqual(opened.at, anchor);
  assert.equal(opened.ref.hunkId, ref.hunkId);
});

test("link/checkbox click does not open hunk", () => {
  assert.equal(
    shouldOpenInlineHunk({ selectionEmpty: true, interactive: true }),
    false,
  );
  assert.equal(
    shouldOpenInlineHunk({ selectionEmpty: true, interactive: false }),
    true,
  );
});
