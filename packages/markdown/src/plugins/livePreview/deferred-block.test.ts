import assert from "node:assert/strict";
import test from "node:test";
import { EditorState } from "@codemirror/state";
import { WidgetType } from "@codemirror/view";
import { blockIndex, renderRevision } from "./blocks";
import {
  blockDecorations,
  blockHotRanges,
  blockViewportSupport,
  setBlockHotRanges,
} from "./viewport-decorations";
import {
  DeferredBlockWidget,
  expandVisibleRanges,
  rangesIntersect,
  VIEWPORT_BLOCK_MARGIN,
} from "./deferred-block";
import { documentTree, replaceDocumentTree } from "./document-tree";
import { parseMarkdown } from "../../markdown/dialect";
import { blockRenderers } from "./registry";
import type { RenderBlock } from "./api";

test("expandVisibleRanges pads the visible band and handles an empty viewport", () => {
  assert.deepEqual(expandVisibleRanges([], 1000, 100), [{ from: 0, to: 200 }]);
  assert.deepEqual(expandVisibleRanges([{ from: 500, to: 600 }], 1000, 100), [
    { from: 400, to: 700 },
  ]);
  assert.ok(rangesIntersect(450, 460, [{ from: 400, to: 700 }]));
  assert.ok(!rangesIntersect(10, 20, [{ from: 400, to: 700 }]));
});

class LiveWidget extends WidgetType {
  constructor(readonly block: RenderBlock) {
    super();
  }
  override eq(other: LiveWidget): boolean {
    return other.block.source === this.block.source;
  }
  toDOM(): HTMLElement {
    return document.createElement("div");
  }
}

test("below-fold blocks mount DeferredBlockWidget when explicit blockHotRanges scopes the band", () => {
  const blockSource = "| a | b |\n| - | - |\n| 1 | 2 |";
  const doc =
    "intro\n\n" +
    Array.from({ length: 400 }, () => blockSource).join("\n\n") +
    "\n\nend";
  assert.ok(doc.length > VIEWPORT_BLOCK_MARGIN * 2);
  const decorations = blockDecorations(() => {});
  let state = EditorState.create({
    doc,
    extensions: [
      documentTree,
      renderRevision,
      blockIndex,
      ...blockViewportSupport,
      decorations,
      blockRenderers.of({
        kind: "Table",
        editing: "widget",
        match: (node) => node.name === "Table",
        widget: (block) => new LiveWidget(block),
      }),
    ],
  });
  state = state.update({
    effects: [
      replaceDocumentTree.of(parseMarkdown(state.doc)),
      setBlockHotRanges.of([{ from: 0, to: VIEWPORT_BLOCK_MARGIN * 2 }]),
    ],
  }).state;
  let live = 0;
  let deferred = 0;
  state.field(decorations).between(0, doc.length, (_from, _to, value) => {
    const widget = value.spec.widget;
    if (widget instanceof DeferredBlockWidget) {
      deferred++;
    } else if (widget) {
      live++;
    }
  });
  assert.ok(deferred > 0, `expected deferred shells, got ${deferred}`);
  assert.ok(live > 0, `expected live widgets, got ${live}`);
  assert.ok(
    deferred + live === 400,
    `expected one widget per table (live ${live}, deferred ${deferred})`,
  );
});

test("by default blockHotRanges covers the full document and reuses GuardedWidget instances across tree completion", () => {
  const blockSource = "| a | b |\n| - | - |\n| 1 | 2 |";
  const doc =
    "intro\n\n" +
    Array.from({ length: 120 }, () => blockSource).join("\n\n") +
    "\n\nend";
  const decorations = blockDecorations(() => {});
  let state = EditorState.create({
    doc,
    selection: { anchor: doc.length },
    extensions: [
      documentTree,
      renderRevision,
      blockIndex,
      ...blockViewportSupport,
      decorations,
      blockRenderers.of({
        kind: "Table",
        editing: "widget",
        match: (node) => node.name === "Table",
        widget: (block) => new LiveWidget(block),
      }),
    ],
  });
  assert.deepEqual(state.field(blockHotRanges), [{ from: 0, to: doc.length }]);
  const beforeWidgets: unknown[] = [];
  state.field(decorations).between(0, VIEWPORT_BLOCK_MARGIN, (_f, _t, dec) => {
    beforeWidgets.push(dec.spec.widget);
  });
  assert.ok(beforeWidgets.length > 0);

  state = state.update({
    effects: replaceDocumentTree.of(parseMarkdown(state.doc)),
  }).state;

  const afterWidgets: unknown[] = [];
  state.field(decorations).between(0, VIEWPORT_BLOCK_MARGIN, (_f, _t, dec) => {
    afterWidgets.push(dec.spec.widget);
  });
  assert.equal(afterWidgets.length, beforeWidgets.length);
  for (let i = 0; i < beforeWidgets.length; i++) {
    assert.equal(afterWidgets[i], beforeWidgets[i]);
  }
});
