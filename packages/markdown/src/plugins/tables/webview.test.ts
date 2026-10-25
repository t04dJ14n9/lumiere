import test from "node:test";
import assert from "node:assert/strict";
import { keymap } from "@codemirror/view";
import type { EditorView } from "@codemirror/view";
import {
  EditorState,
  type Extension,
  type TransactionSpec,
} from "@codemirror/state";
import { createRoot } from "@workshop/core";
import { Endpoint } from "../../shared/rpc/endpoint";
import type { EditorService } from "../editor/api";
import type { MarkdownService } from "../dialect/api";
import type { BlockRenderer } from "../livePreview/api";
import { tablesWebview } from "./webview";
import { TableWidget } from "./widget";

function wheel(overrides: Partial<WheelEvent> = {}) {
  return Object.assign(new Event("wheel", { cancelable: true }), {
    deltaX: 0,
    deltaY: 120,
    deltaMode: 0,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...overrides,
  });
}

test("tables always register a widget and own their document-entry keys and commands", async () => {
  const root = createRoot();
  const renderers: BlockRenderer[] = [];
  const extensions: Extension[] = [];
  const commands = new Map<string, () => boolean | Promise<boolean>>();
  const scrolls: ScrollToOptions[] = [];
  const viewport = Object.assign(new EventTarget(), {
    scrollTop: 600,
    scrollHeight: 2000,
    clientHeight: 500,
    scrollTo: (options: ScrollToOptions) => scrolls.push(options),
  });
  const dom = Object.assign(new EventTarget(), {
    ownerDocument: {
      defaultView: { matchMedia: () => ({ matches: false }) },
    },
  });
  let document = EditorState.create();
  const view = {
    dom,
    scrollDOM: viewport,
    get state() {
      return document;
    },
    dispatch(spec: TransactionSpec) {
      document = document.update(spec).state;
    },
  } as unknown as EditorView;
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
    "\n|     |     |\n| --- | --- |\n|     |     |\n",
  );
  const widget = renderers[0]!.widget({
    kind: "Table",
    source: document.doc.toString(),
    from: 0,
    to: document.doc.length,
  });
  assert.ok(widget instanceof TableWidget);
  const scrollNote = widget.environment.scrollNote;
  for (const type of ["wheel", "pointerdown", "keydown", "touchstart"]) {
    const before = scrolls.length;
    scrollNote(120, wheel());
    assert.deepEqual(scrolls.at(-1), { top: 720, behavior: "instant" });
    // Instant motion has no pending destination; interruption is a no-op.
    dom.dispatchEvent(new Event(type));
    assert.equal(scrolls.length, before + 1);
  }
  const forwardedWheel = new Event("wheel", { cancelable: true });
  forwardedWheel.preventDefault();
  scrollNote(120, wheel());
  dom.dispatchEvent(forwardedWheel);
  assert.equal(scrolls.at(-1)?.behavior, "instant");
  dom.dispatchEvent(new Event("pointerdown"));
  viewport.scrollTop = 600;
  scrollNote(0.25, wheel({ deltaY: 0.25 }));
  assert.deepEqual(scrolls.at(-1), { top: 600.25, behavior: "instant" });
  viewport.scrollTop = 900;
  scrollNote(0.25, wheel({ deltaY: 0.25 }));
  assert.equal(scrolls.at(-1)?.top, 900.25);
  viewport.scrollTop = 600;
  const beforeDispose = scrolls.length;
  await root.dispose();
  // Disposal stops motion; with no pending destination that is a no-op.
  assert.equal(scrolls.length, beforeDispose);
  const afterDisposal = scrolls.length;
  dom.dispatchEvent(new Event("wheel"));
  assert.equal(scrolls.length, afterDisposal);
  rpc.dispose();
  assert.equal(renderers.length, 0);
  assert.equal(extensions.length, 0);
  assert.equal(commands.size, 0);
});
