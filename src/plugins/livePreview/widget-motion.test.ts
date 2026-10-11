import assert from "node:assert/strict";
import test from "node:test";
import { EditorState } from "@codemirror/state";
import { foldEffect, foldState } from "@codemirror/language";
import { blockIndex } from "./blocks";
import { blockRenderers } from "./registry";
import { documentTree } from "./document-tree";
import { renderedWidgets, foldedRanges, verticalBlock } from "./motion";

test("widget motion queries exclude reveal renderers and source overrides but retain tables under visual selections", () => {
  const source =
    "before\n\n| a | b |\n|---|---|\n| c | d |\n\n```\nx\n```\n\nafter";
  const state = (showSource = false) =>
    EditorState.create({
      doc: source,
      selection: { anchor: 0, head: source.length },
      extensions: [
        documentTree,
        blockIndex,
        blockRenderers.of({
          kind: "Table",
          editing: "widget",
          match: (node) => node.name === "Table",
          showSource: () => showSource,
          widget: () => {
            throw new Error("Not mounted");
          },
        }),
        blockRenderers.of({
          kind: "code",
          editing: "reveal",
          match: (node) => node.name === "FencedCode",
          widget: () => {
            throw new Error("Not mounted");
          },
        }),
      ],
    });
  assert.deepEqual(
    renderedWidgets(state(), 0, source.length).map((block) => block.kind),
    ["Table"],
  );
  assert.deepEqual(renderedWidgets(state(), 0, 6), []);
  assert.deepEqual(renderedWidgets(state(true), 0, source.length), []);
  assert.deepEqual(
    renderedWidgets(EditorState.create({ doc: source }), 0, source.length),
    [],
  );
});

test("a table hidden inside a collapsed heading is absent from the widget motion query", () => {
  const source = "# Folded\n| a | b |\n|---|---|\n| c | d |\n\n# After";
  const state = EditorState.create({
    doc: source,
    extensions: [
      documentTree,
      blockIndex,
      foldState,
      blockRenderers.of({
        kind: "Table",
        editing: "widget",
        match: (node) => node.name === "Table",
        widget() {
          throw new Error("Not mounted");
        },
      }),
    ],
  });
  assert.equal(renderedWidgets(state, 0, source.length).length, 1);
  const folded = state.update({
    effects: foldEffect.of({ from: 8, to: source.indexOf("\n# After") }),
  }).state;
  assert.deepEqual(renderedWidgets(folded, 0, source.length), []);
  assert.equal(verticalBlock(folded, 1), undefined);
  assert.deepEqual(foldedRanges(folded), [
    { from: 8, to: source.indexOf("\n# After") },
  ]);
});

test("nested folds expose one disjoint span without hiding a separate visible table", () => {
  const source = "# Folded\n## Inner\ntext\n\n# After\n\n| a | b |\n|---|---|";
  const state = EditorState.create({
    doc: source,
    extensions: [
      documentTree,
      blockIndex,
      foldState,
      blockRenderers.of({
        kind: "Table",
        editing: "widget",
        match: (node) => node.name === "Table",
        widget() {
          throw new Error("Not mounted");
        },
      }),
    ],
  });
  const to = source.indexOf("\n\n# After");
  const folded = state.update({
    effects: [foldEffect.of({ from: 17, to }), foldEffect.of({ from: 8, to })],
  }).state;
  assert.deepEqual(foldedRanges(folded), [{ from: 8, to }]);
  assert.equal(renderedWidgets(folded, 0, source.length).length, 1);
});
