import test from "node:test";
import assert from "node:assert/strict";
import { keymap } from "@codemirror/view";
import type { EditorView } from "@codemirror/view";
import {
  EditorState,
  type Extension,
  type TransactionSpec,
} from "@codemirror/state";
import { Context } from "../../kernel";
import { Endpoint } from "../../shared/rpc/endpoint";
import type { EditorService } from "../editor/api";
import type { MarkdownService } from "../dialect/api";
import type { BlockRenderer } from "../livePreview/api";
import { tablesWebview } from "./webview";

test("tables always register a widget and own their document-entry keys and commands", async () => {
  const root = Context.create();
  const renderers: BlockRenderer[] = [];
  const extensions: Extension[] = [];
  const commands = new Map<string, () => boolean | Promise<boolean>>();
  let document = EditorState.create();
  const view = {
    get state() {
      return document;
    },
    dispatch(spec: TransactionSpec) {
      document = document.update(spec).state;
    },
  } as EditorView;
  root.provide("editor", {
    view,
    extend(extension: Extension) {
      extensions.push(extension);
      return () => {
        extensions.splice(extensions.indexOf(extension), 1);
      };
    },
    clipboard: {
      async read() {
        return "";
      },
      async write() {},
    },
  } as unknown as EditorService);
  root.provide("document", {
    extension: [],
    attach: () => () => {},
    async flush() {},
    pump() {},
    error: undefined,
  });
  root.provide("markdown", {
    language: () => [],
  } as unknown as MarkdownService);
  root.provide("livePreview", {
    mode: "livePreview",
    setMode() {},
    block(renderer) {
      renderers.push(renderer);
      return () => {
        renderers.splice(renderers.indexOf(renderer), 1);
      };
    },
    inline: () => () => {},
  });
  root.provide("render", {
    async into() {
      throw new Error("No DOM in unit test");
    },
  });
  root.provide("commands", {
    register(id, run) {
      commands.set(id, run);
      return () => {
        commands.delete(id);
      };
    },
    async run() {
      return false;
    },
  });
  root.provide("menu", { open: () => () => {} });
  const rpc = new Endpoint(
    { send() {}, listen: () => () => {} },
    { after: () => () => {} },
  );
  root.provide("rpc", rpc);
  const fiber = root.plugin(tablesWebview);
  await root.settled();
  assert.equal(fiber.state, "active");
  assert.equal(renderers[0]!.editing, "widget");
  assert.equal(renderers[0]!.showSource, undefined);
  const state = EditorState.create({ extensions });
  assert.deepEqual(
    state
      .facet(keymap)
      .flatMap((bindings) => bindings.map((binding) => binding.key)),
    ["ArrowUp", "ArrowDown"],
  );
  assert.ok(commands.has("editor:insert-table"));
  assert.equal(await commands.get("editor:insert-table")!(), true);
  assert.equal(
    document.doc.toString(),
    "\n\n| Column 1 | Column 2 |\n| -------- | -------- |\n|          |          |\n\n",
  );
  await root.dispose();
  rpc.dispose();
  assert.equal(renderers.length, 0);
  assert.equal(extensions.length, 0);
  assert.equal(commands.size, 0);
});
