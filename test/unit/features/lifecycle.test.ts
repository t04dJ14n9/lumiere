import test from "node:test";
import { Endpoint } from "../../../src/shared/rpc/endpoint";
import assert from "node:assert/strict";
import { Compartment, EditorState, StateEffect } from "@codemirror/state";
import type { TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { Context } from "../../../src/kernel";
import { featureController } from "../../../src/webview/features";
import { features } from "../../../src/plugins/catalog";
import type { EditorService } from "../../../src/plugins/editor/api";
import { foldRange } from "../../../src/plugins/folding/webview";
import { pairs } from "../../../src/plugins/autoPair/webview";
import { indentation } from "../../../src/plugins/indentGuides/webview";

function fixture() {
  const root = Context.create();
  let state = EditorState.create({ doc: "# Heading\n\nbody" });
  const view = {
    get state() {
      return state;
    },
    dispatch(spec: TransactionSpec) {
      state = state.update(spec).state;
    },
  } as EditorView;
  let extensions = 0;
  root.provide("resources", {
    async load() {
      throw new Error("No resources in unit fixture");
    },
  });
  root.provide("render", {
    async into() {
      throw new Error("No DOM in unit fixture");
    },
  });
  root.provide("livePreview", {
    mode: "source",
    setMode() {},
    block() {
      extensions++;
      return () => {
        extensions--;
      };
    },
    inline() {
      extensions++;
      return () => {
        extensions--;
      };
    },
  });
  let receive: (value: unknown) => void = () => {};
  const rpc = new Endpoint(
    {
      listen(listener) {
        receive = listener;
        return () => {};
      },
      send(value) {
        const message = value as { kind: string; id: number };
        if (message.kind === "request")
          queueMicrotask(() =>
            receive({
              kind: "response",
              id: message.id,
              result: { fragment: "" },
            }),
          );
      },
    },
    {
      after() {
        return () => {};
      },
    },
  );
  root.provide("rpc", rpc);
  root.effect(() => () => rpc.dispose());
  const handlers = new Map<string, () => boolean | Promise<boolean>>();
  root.provide("editor", {
    view,
    mode: "source",
    folds: new Map(),
    focus() {},
    clipboard: {
      async read() {
        return "";
      },
      async write() {},
    },
    extend(extension) {
      extensions++;
      const compartment = new Compartment();
      view.dispatch({
        effects: StateEffect.appendConfig.of(compartment.of(extension)),
      });
      return () => {
        extensions--;
        view.dispatch({ effects: compartment.reconfigure([]) });
      };
    },
  } satisfies EditorService);
  root.provide("commands", {
    register(id, run) {
      assert.equal(handlers.has(id), false);
      handlers.set(id, run);
      return () => {
        handlers.delete(id);
      };
    },
    async run(id) {
      return (await handlers.get(id)?.()) ?? false;
    },
  });
  return {
    root,
    view,
    handlers,
    configure: featureController(root),
    get extensions() {
      return extensions;
    },
  };
}

for (const manifest of features) {
  test(`${manifest.id}: disabling and re-enabling disposes its extensions and commands`, async () => {
    const f = fixture();
    const config =
      (manifest.config?.parse({}) as Record<string, unknown>) ?? {};
    await f.configure({ [manifest.id]: { enabled: true, config } });
    const fiber = [...f.root.runtime.fibers].find(
      (fiber) => fiber.definition.name === manifest.id,
    )!;
    assert.equal(fiber.state, "active", String(fiber.error));
    assert.ok(f.extensions > 0);
    for (const command of manifest.contributes?.commands ?? []) {
      assert.equal(f.handlers.has(command.editorCommand!), true);
    }
    await f.configure({});
    assert.equal(f.extensions, 0);
    assert.equal(f.handlers.size, 0);
    await f.configure({ [manifest.id]: { enabled: true, config } });
    assert.ok(f.extensions > 0);
    await f.root.dispose();
    assert.equal(f.extensions, 0);
    assert.equal(f.handlers.size, 0);
  });
}

test("queued setting updates settle on the latest configuration and recover after invalid input", async () => {
  const f = fixture();
  await assert.rejects(
    f.configure({ autoPair: { enabled: true, config: { brackets: "wrong" } } }),
  );
  const on = f.configure({ lineNumbers: { enabled: true, config: {} } });
  const off = f.configure({});
  await Promise.all([on, off]);
  assert.equal(f.extensions, 0);
  await f.root.dispose();
});

test("heading and indent folding respect independent settings and section boundaries", () => {
  const state = EditorState.create({
    doc: "# Head\nbody\n# Next\nnext\n  child\n    grandchild\ntail",
  });
  assert.deepEqual(foldRange(state, 0, 6, { heading: true, indent: false }), {
    from: 6,
    to: 11,
  });
  assert.equal(foldRange(state, 0, 6, { heading: false, indent: false }), null);
  const line = state.doc.line(4);
  assert.deepEqual(
    foldRange(state, line.from, line.to, { heading: false, indent: true }),
    { from: line.to, to: state.doc.line(6).to },
  );
});

test("pair settings separate Markdown from brackets and indentation uses tab stops", () => {
  assert.deepEqual(pairs({ brackets: false, markdown: false }), []);
  assert.ok(pairs({ brackets: false, markdown: true }).includes("*"));
  assert.equal(pairs({ brackets: false, markdown: true }).includes("("), false);
  assert.equal(indentation(" \t  text", 4), 6);
});
