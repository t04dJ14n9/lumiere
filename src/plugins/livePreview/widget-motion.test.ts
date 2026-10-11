import assert from "node:assert/strict";
import test from "node:test";
import { EditorState } from "@codemirror/state";
import { blockIndex } from "./blocks";
import { blockRenderers } from "./registry";
import { documentTree } from "./document-tree";
import { renderedWidgets } from "./motion";

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
