import { config as editorConfig } from "../editor/manifest";
import test from "node:test";
import assert from "node:assert/strict";
import { Compartment, EditorState, StateEffect } from "@codemirror/state";
import type { Extension, TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { Context } from "../../kernel";
import type { EditorService } from "../editor/api";
import type { LivePreview } from "./api";
import { livePreviewWebview } from "./webview";
import { blockIndex } from "./blocks";
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

test("vertical navigation skips rendered blocks and Escape leaves final source", () => {
  const doc = "before\n```\ncode\n```\nafter";
  assert.equal(verticalBlock(sourceState(doc), 1), doc.indexOf("after"));
  assert.equal(verticalBlock(sourceState(doc, doc.length), -1), 6);
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
  const root = Context.create();
  root.provide("editor", {
    view,
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
  const kernel = livePreviewKernel("before\n\n---\n\nafter");
  const { root, fiber } = kernel;
  await root.settled();
  assert.equal(fiber.state, "active");
  const preview = root.runtime.value("livePreview") as LivePreview;
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

test("an indented code block renders from the start of its line", async () => {
  const kernel = livePreviewKernel("Text\n\n    indented code\n");
  await kernel.root.settled();
  const [block] = kernel.state().field(blockIndex);
  assert.equal(block?.kind, "CodeBlock");
  assert.equal(block?.from, 6);
  assert.equal(block?.source, "    indented code");
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
  // Lezer parses consecutive footnote definitions as one paragraph.
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
