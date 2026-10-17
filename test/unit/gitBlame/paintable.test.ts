import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { blockIndex } from "../../../src/plugins/livePreview/blocks";
import { blockRenderers } from "../../../src/plugins/livePreview/registry";
import { documentTree } from "../../../src/plugins/livePreview/document-tree";
import { canPaintBlameAt } from "../../../src/plugins/gitBlame/paintable";
import {
  BlameEolWidget,
  blameDecorations,
  blameIdentityField,
} from "../../../src/plugins/gitBlame/blameWidget";
import { blameField, setBlame } from "../../../src/plugins/gitBlame/state";

const blame = {
  commit: "a".repeat(40),
  shortCommit: "aaaaaaa",
  authorName: "Ada",
  authorEmail: "ada@example.com",
  authorDate: 1700000000,
  subject: "Hi",
  body: "Body",
  line: 2,
};

test("canPaintBlameAt is true without a livePreview block index", () => {
  const state = EditorState.create({ doc: "a\nb\nc" });
  assert.equal(canPaintBlameAt(state, state.doc.line(2).to), true);
});

test("unrevealed widget replace covers interior positions", () => {
  const doc = "before\n\n| a | b |\n|---|---|\n| c | d |\n\nafter\n";
  const state = EditorState.create({
    doc,
    extensions: [
      documentTree,
      blockIndex,
      blockRenderers.of({
        kind: "Table",
        editing: "widget",
        match: (node) => node.name === "Table",
        widget: () => {
          throw new Error("not mounted");
        },
      }),
    ],
  });
  const table = state.field(blockIndex).find((block) => block.kind === "Table");
  assert.ok(table);
  assert.equal(canPaintBlameAt(state, table!.from), false);
  assert.equal(canPaintBlameAt(state, table!.from + 1), false);
  assert.equal(canPaintBlameAt(state, table!.to), true);
  assert.equal(canPaintBlameAt(state, 0), true);
});

test("revealed replace allows painting on the caret line again", () => {
  const doc = "before\n\n| a | b |\n|---|---|\n| c | d |\n\nafter\n";
  const state = EditorState.create({
    doc,
    selection: { anchor: doc.indexOf("| c") },
    extensions: [
      documentTree,
      blockIndex,
      blockRenderers.of({
        kind: "Table",
        editing: "reveal",
        match: (node) => node.name === "Table",
        widget: () => {
          throw new Error("not mounted");
        },
      }),
    ],
  });
  const table = state.field(blockIndex).find((block) => block.kind === "Table");
  assert.ok(table);
  assert.equal(canPaintBlameAt(state, table!.from + 1), true);
});

test("blame decorations omit the ghost inside an unrevealed replace", () => {
  const doc = "before\n\n| a | b |\n|---|---|\n| c | d |\n\nafter\n";
  let state = EditorState.create({
    doc,
    selection: { anchor: 0 },
    extensions: [
      documentTree,
      blockIndex,
      blockRenderers.of({
        kind: "Table",
        editing: "widget",
        match: (node) => node.name === "Table",
        widget: () => {
          throw new Error("not mounted");
        },
      }),
      blameField,
      blameIdentityField,
      blameDecorations,
    ],
  });
  const table = state.field(blockIndex).find((block) => block.kind === "Table");
  assert.ok(table);
  const line = state.doc.lineAt(table!.from + 1).number;
  state = state.update({
    effects: setBlame.of({ ...blame, line }),
  }).state;
  assert.equal(state.field(blameDecorations).size, 0);

  state = state.update({
    effects: setBlame.of({ ...blame, line: 1 }),
  }).state;
  assert.equal(state.field(blameDecorations).size, 1);
  assert.ok(
    state.field(blameDecorations).iter().value?.spec.widget instanceof
      BlameEolWidget,
  );
});
