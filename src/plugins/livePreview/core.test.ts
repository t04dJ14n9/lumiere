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

test("kernel disposal and Source mode remove the engine; registry effects add and remove", async () => {
  let state = EditorState.create({ doc: "before\n\n---\n\nafter" });
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
    mode: "livePreview",
    folds: new Map(),
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
  await root.settled();
  assert.equal(fiber.state, "active");
  const preview = root.runtime.value("livePreview") as LivePreview;
  assert.equal(state.field(blockIndex).length, 1);
  const remove = preview.block({
    kind: "paragraph",
    editing: "reveal",
    match: (node) => node.name === "Paragraph",
    widget: () => {
      throw new Error("No DOM");
    },
  });
  assert.equal(state.field(blockIndex).length, 3);
  remove();
  assert.equal(state.field(blockIndex).length, 1);
  preview.setMode("source");
  assert.equal(state.field(blockIndex, false), undefined);
  preview.setMode("livePreview");
  assert.equal(state.field(blockIndex).length, 1);
  await fiber.dispose();
  assert.equal(state.field(blockIndex, false), undefined);
  assert.equal(state.facet(blockRenderers).length, 0);
  await root.dispose();
});
