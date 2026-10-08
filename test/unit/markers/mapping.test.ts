import test from "node:test";
import assert from "node:assert/strict";
import { ChangeSet, EditorState } from "@codemirror/state";
import {
  MarkerRevisions,
  mapMarker,
} from "../../../src/plugins/markers/revisions";
import {
  WireMarkerHistory,
  markerState,
  setMarkers,
} from "../../../src/plugins/markers/view-state";
import type { SourceMarker } from "../../../src/plugins/markers/api";
const marker: SourceMarker = {
  id: "one",
  from: 3,
  to: 6,
  documentVersion: 1,
  label: "Question",
};
test("native marker history preserves CRLF offsets, disjoint edits and untouched middle ranges", () => {
  const history = new MarkerRevisions(1, "a\r\nbbb\r\nc");
  history.update(2, "long\r\nbbb\r\nend", [
    { from: 0, to: 1, insert: "long" },
    { from: 8, to: 9, insert: "end" },
  ]);
  assert.deepEqual(history.map(marker), {
    ...marker,
    from: 6,
    to: 9,
    documentVersion: 2,
  });
  assert.throws(() => history.map({ ...marker, documentVersion: 0 }), {
    code: "StaleSelection",
  });
  assert.throws(() => history.map({ ...marker, to: 100 }), {
    code: "InvalidArgument",
  });
  history.update(3, "long\r\n\r\nend");
  assert.equal(history.map(marker), undefined);
});
test("marker mapping drops deleted ranges and retains zero-length anchors", () => {
  assert.equal(
    mapMarker(marker, ChangeSet.of({ from: 3, to: 6 }, 9)),
    undefined,
  );
  const anchor = { ...marker, from: 3, to: 3 };
  assert.deepEqual(
    mapMarker(anchor, ChangeSet.of({ from: 3, insert: "x" }, 9)),
    { ...anchor, from: 4, to: 4 },
  );
});
test("wire marker history maps accepted server changes and pending local edits exactly once", () => {
  const history = new WireMarkerHistory();
  const change = ChangeSet.of({ from: 0, insert: "x" }, 9);
  history.record(0, [{ changes: change.toJSON() as unknown[] }]);
  const pending = ChangeSet.of({ from: 0, insert: "y" }, 10);
  const snapshot = { version: 0, revision: 1, owners: { plugin: [marker] } };
  assert.deepEqual(history.map(snapshot, 1, [{ changes: pending }]), [
    { owner: "plugin", marker: { ...marker, from: 5, to: 8 } },
  ]);
  assert.equal(history.map(snapshot, 2, []), undefined);
  let state = EditorState.create({ doc: "012345678", extensions: markerState });
  state = state.update({
    effects: setMarkers.of([{ owner: "plugin", marker }]),
  }).state;
  state = state.update({ changes: { from: 0, insert: "x" } }).state;
  assert.equal(state.field(markerState)[0]!.marker.to, 7);
});
