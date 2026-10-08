import test from "node:test";
import assert from "node:assert/strict";
import {
  titleFromSource,
  renameTarget,
} from "../../../src/plugins/inlineTitle/title";
import {
  protocol,
  titleValue,
  transfer,
} from "../../../src/plugins/inlineTitle/protocol";
import {
  protocol as editor,
  viewState,
} from "../../../src/plugins/editor/protocol";

const state = viewState.parse({
  source: "file:///note.md",
  anchor: 50,
  head: 12,
  scrollTop: 240.5,
  scrollLeft: 2.5,
  scrollAnchor: { from: 30, offset: -9.5 },
  contributions: {
    folded: [{ from: 2, to: 10 }],
    folds: { "file:///note.md|content|0": false },
  },
  mode: "source",
});

test("inline titles decode names and validate same-folder filename targets", () => {
  assert.equal(
    titleFromSource("file:///vault/Hello%20World.MARKDOWN"),
    "Hello World",
  );
  assert.equal(titleFromSource("broken"), "Untitled");
  assert.equal(
    renameTarget("file:///vault/Old.md", "  A # ? %  "),
    "file:///vault/A%20%23%20%3F%20%25.md",
  );
  for (const title of [
    "",
    ".",
    "..",
    "a/b",
    "a\\b",
    "a:b",
    "a\nb",
    "a\0b",
    "x".repeat(256),
  ]) {
    assert.throws(() => renameTarget("file:///vault/Old.md", title));
  }
  assert.throws(() => renameTarget("untitled:Note.md", "New"));
});

test("title responses and selection restores validate optional error and focus fields", () => {
  assert.equal(
    titleValue.parse({ title: "Note", error: "Already exists" }).error,
    "Already exists",
  );
  assert.throws(() => titleValue.parse({ title: "Note", error: false }));
  for (const focus of [false, true]) {
    assert.equal(
      editor.requests.reveal.params.parse({ from: 1, to: 4, focus }).focus,
      focus,
    );
  }
  assert.throws(() =>
    editor.requests.reveal.params.parse({ from: 1, to: 4, focus: "false" }),
  );
  assert.throws(() => protocol.requests.focus.params.parse({ target: true }));
});

test("pane transfers accept backward selections, fractional scroll offsets and independent focus intent", () => {
  assert.deepEqual(transfer.parse({ state, focus: "properties" }), {
    state,
    focus: "properties",
  });
  assert.deepEqual(transfer.parse({ state }), { state });
  assert.equal(
    protocol.requests.rename.params.parse({
      title: "Renamed",
      focus: "properties",
    }).focus,
    "properties",
  );
});

test("pane transfers reject malformed positions, folding state and focus targets", () => {
  for (const patch of [
    { head: -1 },
    { anchor: 1.5 },
    { scrollTop: NaN },
    { scrollTop: -1 },
    { scrollAnchor: { from: 0, offset: Infinity } },
    { folded: [{ from: 5, to: 2 }] },
    { folded: [{ from: 2, to: 2 }] },
    { folds: { key: "false" } },
    { mode: "reading" },
  ]) {
    assert.throws(() => transfer.parse({ state: { ...state, ...patch } }));
  }
  assert.throws(() => transfer.parse({ state, focus: "dialog" }));
  assert.throws(() =>
    protocol.requests.rename.params.parse({ title: "Renamed", focus: true }),
  );
});
