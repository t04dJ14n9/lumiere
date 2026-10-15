import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { computeHunks } from "../../../src/plugins/gitGutter/hunks";
import {
  docHunkForDiffHunk,
  revertDisplayedHunk,
} from "../../../src/plugins/gitGutter/revert-run";
import { revertChange } from "../../../src/plugins/gitGutter/hunks";
import { DiffSession } from "../../../src/plugins/gitGutter/session";

test("buffer change after click and before execute edits nothing", async () => {
  const session = new DiffSession("HEAD");
  const baseline = "old\n";
  let doc = "new\n";
  session.publish("file", baseline, doc);
  const held = computeHunks(baseline, EditorState.create({ doc }).doc)[0];
  assert.ok(held);
  let applied = 0;
  await revertDisplayedHunk({
    session,
    hunk: held,
    fileUri: "file",
    baseline,
    docText: () => doc,
    hold: async () => {
      doc = "newer\n";
      session.noteDocument(doc);
      return true;
    },
    apply: () => {
      applied += 1;
      return true;
    },
  });
  assert.equal(applied, 0);
  assert.equal(doc, "newer\n");
});

test("a stable buffer reverts the validated hunk, not a later edit", async () => {
  const session = new DiffSession("HEAD");
  const baseline = "old\n";
  const doc = "new\n";
  session.publish("file", baseline, doc);
  const held = computeHunks(baseline, EditorState.create({ doc }).doc)[0];
  assert.ok(held);
  let reverted = "";
  await revertDisplayedHunk({
    session,
    hunk: held,
    fileUri: "file",
    baseline,
    docText: () => doc,
    hold: async () => true,
    apply: (validated) => {
      const state = EditorState.create({ doc });
      const target = docHunkForDiffHunk(baseline, state.doc, validated);
      assert.ok(target);
      reverted = state
        .update({ changes: revertChange(state, target) })
        .state.doc.toString();
      return true;
    },
  });
  assert.equal(reverted, "old\n");
});
