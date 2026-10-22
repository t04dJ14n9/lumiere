import { config as editorConfig } from "../editor/manifest";
import test from "node:test";
import assert from "node:assert/strict";
import { Compartment, EditorState, StateEffect } from "@codemirror/state";
import type { Extension, TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { WidgetType } from "@codemirror/view";
import { createRoot } from "@workshop/core";
import type { EditorService } from "../editor/api";
import type { BlockRenderer, LivePreview } from "./api";
import { livePreviewWebview } from "./webview";
import { blockIndex, editingDecorations } from "./blocks";
import { blockDecorations } from "./viewport-decorations";
import { blockRenderers, revealed } from "./registry";
import { documentTree } from "./document-tree";
import { escapeBlock, verticalBlock } from "./motion";

function sourceState(doc: string, anchor = 0) {
  return EditorState.create({
    doc,
    selection: { anchor },
    extensions: [
      documentTree,
      blockIndex,
      blockRenderers.of({
        kind: "code",
        editing: "reveal",
        match: (node) => node.name === "FencedCode",
        widget: () => {
          throw new Error("Not mounted in a unit test");
        },
      }),
    ],
  });
}

test("reveal includes both endpoints and every selection range", () => {
  const state = sourceState("before\n\n```\ncode\n```\n\nafter");
  const block = state.field(blockIndex)[0]!;
  for (const anchor of [block.from, block.to]) {
    assert.equal(
      revealed(
        state.update({ selection: { anchor } }).state,
        block.from,
        block.to,
      ),
      true,
    );
  }
  assert.equal(revealed(state, block.from, block.to), false);
});

test("vertical navigation enters revealing blocks and Escape leaves final source", () => {
  const doc = "before\n```\ncode\n```\nafter";
  // Obsidian reveals a code block's source when the caret arrows into it.
  assert.equal(verticalBlock(sourceState(doc), 1), doc.indexOf("```"));
  assert.equal(
    verticalBlock(sourceState(doc, doc.length), -1),
    doc.lastIndexOf("```"),
  );
  assert.equal(
    escapeBlock(sourceState(doc, doc.indexOf("code"))),
    doc.indexOf("after"),
  );
  const atEnd = "before\n```\ncode\n```";
  assert.equal(escapeBlock(sourceState(atEnd, atEnd.length)), 6);
  assert.equal(escapeBlock(sourceState("```\ncode\n```", 4)), undefined);
});

/** The Live Preview plugin in a kernel over a bare `EditorState`. */
function livePreviewKernel(doc: string) {
  let state = EditorState.create({ doc });
  const view = {
    get state() {
      return state;
    },
    dispatch(spec: TransactionSpec) {
      state = state.update(spec).state;
    },
  } as EditorView;
  const root = createRoot();
  root.provide("editor", {
    view,
    navigate: (jump) => jump(),
    onNavigate: () => () => {},
    settled: async () => true,
    caret: () => [],
    settings: editorConfig.parse({}),
    mode: "livePreview",
    source: "note.md",
    viewState: { contribute: () => () => {} },
    focus() {},
    clipboard: {
      async read() {
        return "";
      },
      async write() {},
    },
    extend(extension: Extension) {
      const compartment = new Compartment();
      view.dispatch({
        effects: StateEffect.appendConfig.of(compartment.of(extension)),
      });
      return () => view.dispatch({ effects: compartment.reconfigure([]) });
    },
  } satisfies EditorService);
  root.provide("commands", {
    register() {
      return () => {};
    },
    async run() {
      return false;
    },
  });
  root.provide("render", {
    async into() {
      throw new Error("No DOM in unit test");
    },
  });
  const fiber = root.plugin(livePreviewWebview, { mode: "livePreview" });
  return { root, fiber, state: () => state };
}

test("kernel disposal and Source mode remove the engine; registry effects add and remove", async () => {
  const kernel = livePreviewKernel("before\n\n<div>x</div>\n\nafter");
  const { root, fiber } = kernel;
  await root.settled();
  assert.equal(fiber.state, "active");
  const preview = root.service("livePreview") as LivePreview;
  assert.equal(kernel.state().field(blockIndex).length, 1);
  const remove = preview.block({
    kind: "paragraph",
    editing: "reveal",
    match: (node) => node.name === "Paragraph",
    widget: () => {
      throw new Error("No DOM");
    },
  });
  assert.equal(kernel.state().field(blockIndex).length, 3);
  remove();
  assert.equal(kernel.state().field(blockIndex).length, 1);
  preview.setMode("source");
  assert.equal(kernel.state().field(blockIndex, false), undefined);
  preview.setMode("livePreview");
  assert.equal(kernel.state().field(blockIndex).length, 1);
  await fiber.dispose();
  assert.equal(kernel.state().field(blockIndex, false), undefined);
  assert.equal(kernel.state().facet(blockRenderers).length, 0);
  await root.dispose();
});

test("an HTML block renders from the start of its line; code and rules stay source lines", async () => {
  const kernel = livePreviewKernel(
    "Text\n\n  <div>x</div>\n\n    indented code\n\n```js\nx\n```\n\n---\n",
  );
  await kernel.root.settled();
  const blocks = kernel.state().field(blockIndex);
  assert.deepEqual(
    blocks.map((block) => [block.kind, block.from, block.source]),
    [["HTMLBlock", 6, "  <div>x</div>"]],
  );
  await kernel.root.dispose();
});

test("explicit renderer ranges cover multiline definitions without overlapping later nodes", () => {
  const text = "Text[^a]\n\n[^a]: definition\n    continued\n\n    next\n\nend";
  const from = text.indexOf("[^a]:");
  const to = text.indexOf("\n\nend");
  const state = EditorState.create({
    doc: text,
    extensions: [
      documentTree,
      blockIndex,
      blockRenderers.of({
        kind: "definition",
        editing: "reveal",
        match: (node) => node.from === from,
        range: () => ({ from, to }),
        widget: () => {
          throw new Error("No DOM");
        },
      }),
      blockRenderers.of({
        kind: "code",
        editing: "reveal",
        match: (node) => node.name === "CodeBlock",
        widget: () => {
          throw new Error("No DOM");
        },
      }),
    ],
  });
  assert.deepEqual(
    state.field(blockIndex).map(({ from, to }) => ({ from, to })),
    [{ from, to }],
  );
});

test("a renderer claiming the start of a node leaves its later children to match", () => {
  // Consecutive footnote definitions are separate blocks; the second keeps its continuation.
  const text = "[^a]: first\n[^b]: second\n    continued";
  const second = text.indexOf("[^b]");
  const definitions = [
    { from: 0, to: second - 1 },
    { from: second, to: text.length },
  ];
  const state = EditorState.create({
    doc: text,
    extensions: [
      documentTree,
      blockIndex,
      blockRenderers.of({
        kind: "definition",
        editing: "reveal",
        match: (node) => definitions.some(({ from }) => from === node.from),
        range: (node) => definitions.find(({ from }) => from === node.from)!,
        widget: () => {
          throw new Error("No DOM");
        },
      }),
    ],
  });
  assert.deepEqual(
    state.field(blockIndex).map(({ from, to }) => ({ from, to })),
    definitions,
  );
});

test("vertical motion enters a revealing block's source and still skips widget blocks", () => {
  const doc = "before\n\n$$\nx\n$$\nafter";
  const state = (anchor: number, editing: "reveal" | "widget") =>
    EditorState.create({
      doc,
      selection: { anchor },
      extensions: [
        documentTree,
        blockIndex,
        blockRenderers.of({
          kind: "math",
          editing,
          match: (node) => node.name === "MathBlock",
          widget: () => {
            throw new Error("Not mounted in a unit test");
          },
        }),
      ],
    });
  assert.equal(verticalBlock(state(7, "reveal"), 1), doc.indexOf("$$"));
  assert.equal(
    verticalBlock(state(doc.length, "reveal"), -1),
    doc.lastIndexOf("$$"),
  );
  assert.equal(verticalBlock(state(7, "widget"), 1), doc.indexOf("after"));
});

test("a revealed block with an editing preview marks its source and keeps the result below", () => {
  const doc = "$$\nx\n$$\nafter";
  const state = EditorState.create({
    doc,
    selection: { anchor: 3 },
    extensions: [documentTree, blockIndex],
  });
  const block = {
    from: 0,
    to: doc.indexOf("\nafter"),
    kind: "math",
    source: "$$\nx\n$$",
    renderer: {
      kind: "math",
      editing: "reveal" as const,
      editingPreview: { sourceClass: "md-math-source" },
      match: () => true,
      widget: () => {
        throw new Error("unused");
      },
    },
  };
  const ranges = editingDecorations(state, block, () => new TestWidget());
  const lines = ranges.filter(
    (range) => range.from === range.to && range.value.spec.class,
  );
  assert.deepEqual(
    lines.map((range) => [range.from, range.value.spec.class]),
    [
      [0, "md-math-source"],
      [3, "md-math-source"],
      [5, "md-math-source"],
    ],
  );
  const widget = ranges.at(-1)!;
  assert.equal(widget.from, block.to);
  assert.equal(widget.value.spec.block, true);
  assert.equal(widget.value.spec.side, 1);
  const renderer: BlockRenderer = { ...block.renderer };
  delete renderer.editingPreview;
  const plain = { ...block, renderer };
  assert.deepEqual(
    editingDecorations(state, plain, () => new TestWidget()),
    [],
  );
});

class TestWidget extends WidgetType {
  override toDOM(): HTMLElement {
    throw new Error("Not mounted in a unit test");
  }
}

test("HTML blocks reveal whole source at every offset, including leading indentation", async () => {
  const doc = "before\n\n  <div>\ntext\n</div>\n\nafter";
  const kernel = livePreviewKernel(doc);
  try {
    await kernel.root.settled();
    const decorations = blockDecorations((error) => {
      throw error;
    });
    let state = kernel
      .state()
      .update({ effects: StateEffect.appendConfig.of(decorations) }).state;
    const block = state.field(blockIndex)[0]!;
    assert.equal(state.field(decorations).size, 1);
    for (let at = block.from; at <= block.to; at++) {
      state = state.update({ selection: { anchor: at } }).state;
      assert.equal(state.field(decorations).size, 0, `caret ${at}`);
    }
    state = state.update({ selection: { anchor: doc.length } }).state;
    assert.equal(state.field(decorations).size, 1);
  } finally {
    await kernel.root.dispose();
  }
});

test("Mermaid vertical entry reveals source at either fence without changing text", () => {
  const doc = "before\n\n```mermaid\nflowchart LR\nA --> B\n```\n\nafter";
  for (const [anchor, direction, target] of [
    [7, 1, doc.indexOf("```mermaid")],
    [doc.indexOf("\n\nafter") + 1, -1, doc.lastIndexOf("```")],
  ] as const) {
    const state = sourceState(doc, anchor);
    const block = state.field(blockIndex)[0]!;
    assert.equal(revealed(state, block.from, block.to), false);
    assert.equal(verticalBlock(state, direction), target);
    const next = state.update({ selection: { anchor: target } }).state;
    assert.equal(revealed(next, block.from, block.to), true);
    assert.equal(next.doc.toString(), doc);
  }
});
