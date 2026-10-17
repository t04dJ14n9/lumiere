import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { blockIndex } from "../../../src/plugins/livePreview/blocks";
import { blockRenderers } from "../../../src/plugins/livePreview/registry";
import { documentTree } from "../../../src/plugins/livePreview/document-tree";
import { sourceVisibleAt } from "../../../src/plugins/livePreview/source-visibility";
import {
  canPaintBlameAt,
  sourceVisibility,
} from "../../../src/plugins/gitBlame/paintable";
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

test("canPaintBlameAt is true without a source visibility provider", () => {
  const state = EditorState.create({ doc: "a\nb\nc" });
  assert.equal(canPaintBlameAt(state, state.doc.line(2).to), true);
});

test("sourceVisibleAt is true without a livePreview block index", () => {
  const state = EditorState.create({ doc: "a\nb\nc" });
  assert.equal(sourceVisibleAt(state, state.doc.line(2).to), true);
});

test("canPaintBlameAt asks every source visibility provider", () => {
  const state = EditorState.create({
    doc: "a\nb",
    extensions: [
      sourceVisibility.of(() => true),
      sourceVisibility.of((_state, position) => position !== 1),
    ],
  });
  assert.equal(canPaintBlameAt(state, 0), true);
  assert.equal(canPaintBlameAt(state, 1), false);
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
  assert.equal(sourceVisibleAt(state, table!.from), false);
  assert.equal(sourceVisibleAt(state, table!.from + 1), false);
  // Final table source row EOL is at block.to; must stay covered.
  assert.equal(sourceVisibleAt(state, table!.to), false);
  assert.equal(sourceVisibleAt(state, 0), true);
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
  assert.equal(sourceVisibleAt(state, table!.from + 1), true);
  // Reveal-mode still allows the final-row EOL via revealed(...).
  assert.equal(sourceVisibleAt(state, table!.to), true);
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
      sourceVisibility.of(sourceVisibleAt),
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

test("blame decorations omit the ghost on the final unrevealed table row", () => {
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
      sourceVisibility.of(sourceVisibleAt),
      blameField,
      blameIdentityField,
      blameDecorations,
    ],
  });
  const table = state.field(blockIndex).find((block) => block.kind === "Table");
  assert.ok(table);
  const finalRowLine = state.doc.lineAt(table!.to).number;
  // line.to for the last source row equals block.to when the row ends there.
  assert.equal(state.doc.line(finalRowLine).to, table!.to);
  state = state.update({
    effects: setBlame.of({ ...blame, line: finalRowLine }),
  }).state;
  assert.equal(state.field(blameDecorations).size, 0);
});
