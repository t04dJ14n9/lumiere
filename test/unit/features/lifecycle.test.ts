import { ExtensionRegistry } from "../../../src/plugins/editor/extensions";
import type { LivePreview } from "../../../src/plugins/livePreview/api";
import type { CallerBound } from "../../../src/kernel";
import type { MarkdownService } from "../../../src/plugins/dialect/api";
import type { RenderPass } from "../../../src/plugins/render/api";
import test from "node:test";
import { Endpoint } from "../../../src/shared/rpc/endpoint";
import assert from "node:assert/strict";
import { Compartment, EditorState } from "@codemirror/state";
import type { TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { Context, bindCaller } from "../../../src/kernel";
import { featureController } from "../../../src/webview/features";
import { features, pluginRank } from "../../../src/plugins/catalog";
import type { EditorService } from "../../../src/plugins/editor/api";
import { foldRange } from "../../../src/plugins/folding/webview";
import { pairs } from "../../../src/plugins/autoPair/webview";
import { indentation } from "../../../src/plugins/indentGuides/webview";

function fixture() {
  const root = Context.create({ rank: pluginRank });
  const compartment = new Compartment();
  let state = EditorState.create({ doc: "# Heading\n\nbody", extensions: compartment.of([]) });
  const view = {
    get state() {
      return state;
    },
    dispatch(spec: TransactionSpec) {
      state = state.update(spec).state;
    },
  } as EditorView;
  let extensions = 0;
  root.provide("markdown", {
    language: () => [],
    renderer: {},
  } as unknown as MarkdownService);
  root.provide("menu", {
    open() {
      return () => {};
    },
  });
  root.provide("document", {
    beforeFlush() {
      extensions++;
      return () => {
        extensions--;
      };
    },
    extension: [],
    attach() {
      return () => {};
    },
    async flush() {},
    pump() {},
    error: undefined,
  });
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
  const preview: LivePreview & CallerBound<LivePreview> = {
    mode: "source",
    setMode() {},
    block() { throw new Error("unbound renderer"); },
    inline() { throw new Error("unbound renderer"); },
    [bindCaller](caller) {
      const register = () => registry.register(caller.fiber!.definition.name, []);
      return { ...preview, block: register, inline: register };
    },
  };
  root.provide("livePreview", preview);
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
  const registry = new ExtensionRegistry(pluginRank, (extensions) => {
    view.dispatch({ effects: compartment.reconfigure(extensions) });
  });
  const editor: EditorService & CallerBound<EditorService> = {
    [bindCaller](caller) {
      return { ...editor, extend: (extension, options) =>
        registry.register(options?.owner ?? caller.fiber!.definition.name, extension, options?.slot) };
    },
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
    extend(extension, options) {
      return registry.register(options?.owner ?? "editor", extension, options?.slot);
    },
  };
  root.provide("editor", editor);
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
    registry,
    handlers,
    configure: featureController(root),
    get extensions() {
      return extensions + registry.ordered().length;
    },
  };
}

async function renderHooks(root: Context) {
  let reads = 0;
  const container = {
    innerHTML: "code",
    querySelectorAll() {
      reads++;
      return [];
    },
  } as unknown as HTMLElement;
  const pass: RenderPass = {
    source: "body",
    container,
    sourceLine: 0,
    ancestry: [],
    renderKey: "body",
    measure() {},
    async dispose() {},
    // Model a pass removed before any lazy work can resolve.
    onDispose(stop) {
      void stop();
    },
  };
  await root.serial("render/preProcess", pass);
  await root.serial("render/postProcess", pass);
  const fence = root.bail(
    "render/fence",
    { language: "mermaid", source: "graph TD; A-->B", element: container },
    pass,
  );
  return { reads, prepared: pass.displaySource !== undefined, fence };
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
    const activeHooks = await renderHooks(f.root);
    if (
      ["codeBlocks", "math", "callouts", "tasks", "embeds"].includes(
        manifest.id,
      )
    )
      assert.ok(activeHooks.reads > 0);
    if (manifest.id === "footnotes") assert.equal(activeHooks.prepared, true);
    if (manifest.id === "diagrams") assert.equal(activeHooks.fence, true);
    await f.configure({});
    assert.deepEqual(await renderHooks(f.root), {
      reads: 0,
      prepared: false,
      fence: undefined,
    });
    assert.equal(f.extensions, 0);
    assert.equal(f.handlers.size, 0);
    await f.configure({ [manifest.id]: { enabled: true, config } });
    assert.ok(f.extensions > 0);
    assert.deepEqual(await renderHooks(f.root), activeHooks);
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

function settingsFor(enabled: Set<string>) {
  return Object.fromEntries(features.map((manifest) => [manifest.id, {
    enabled: enabled.has(manifest.id),
    config: (manifest.config?.parse({}) ?? {}) as Record<string, unknown>,
  }]));
}
function owners(f: ReturnType<typeof fixture>) {
  return f.registry.ordered().map(({ owner, slot }) => ({ owner, slot }));
}

test("catalog composition has the same ordered owners after every toggle as a fresh editor", async () => {
  const f = fixture();
  const fresh = fixture();
  const enabled = new Set(features.map((item) => item.id));
  await fresh.configure(settingsFor(enabled));
  await f.configure(settingsFor(enabled));
  const expected = owners(fresh);
  assert.ok(expected.some(({ owner }) => owner === "tables"));
  for (const manifest of features) {
    enabled.delete(manifest.id);
    await f.configure(settingsFor(enabled));
    assert.equal(owners(f).some(({ owner }) => owner === manifest.id), false);
    enabled.add(manifest.id);
    await f.configure(settingsFor(enabled));
    assert.deepEqual(owners(f), expected, manifest.id);
  }
  await f.root.dispose();
  await fresh.root.dispose();
});

test("seeded catalog toggle sequence ends with fresh-start owner order", async () => {
  const f = fixture();
  const enabled = new Set<string>();
  let seed = 104729;
  for (let step = 0; step < 60; step++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const id = features[seed % features.length]!.id;
    if (enabled.has(id)) enabled.delete(id);
    else enabled.add(id);
    await f.configure(settingsFor(enabled));
  }
  const fresh = fixture();
  await fresh.configure(settingsFor(enabled));
  assert.deepEqual(owners(f), owners(fresh));
  await f.root.dispose();
  await fresh.root.dispose();
});
