import test from "node:test";
import assert from "node:assert/strict";
import { Compartment, EditorState } from "@codemirror/state";
import {
  indentUnit,
  foldState,
  foldedRanges,
  foldService,
} from "@codemirror/language";
import { EditorView as ViewFacets, keymap } from "@codemirror/view";
import type { RootContext } from "@workshop/core";
import { markdownParser } from "../../../src/markdown/dialect";
import { headings } from "../../../src/markdown/metadata/headings";
import {
  blockRenderers,
  inlineRenderers,
} from "../../../src/plugins/livePreview/registry";
import type { RenderPass } from "../../../src/plugins/render/api";
import { features } from "../../../src/plugins/catalog";
import { PluginGraph } from "../../../src/plugins/plugin-graph";
import type { PluginDeclaration } from "../../../src/plugins/plugin-graph";
import * as hostPlugins from "../../../src/plugins/host";
import * as webviewPlugins from "../../../src/plugins/webview";
import {
  foldRange,
  foldingChanged,
} from "../../../src/plugins/folding/webview";
import { pairs } from "../../../src/plugins/autoPair/webview";
import { indentation } from "../../../src/plugins/indentGuides/guides";
import { fixture } from "./fixture";
async function renderHooks(root: RootContext) {
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

// Plugins that only post-process rendered HTML, or only contribute commands
// and selection-menu items (Copy Link for Agent), add no editor extensions.
const noEditorExtensions = new Set([
  "onlineVideos",
  "agentBridge",
  "cursorBridge",
]);
const hasExtensions = (f: ReturnType<typeof fixture>, id: string) =>
  noEditorExtensions.has(id) ? f.extensions === 0 : f.extensions > 0;

/** Features that need another feature running (declared through `inject.required`). */
const providers: Record<string, string[]> = {
  gitInline: ["gitGutter"],
  sourcesProperty: ["properties"],
};
const settingsOf = (ids: readonly string[]) =>
  Object.fromEntries(
    ids.map((id) => {
      const manifest = features.find((item) => item.id === id)!;
      return [
        id,
        {
          enabled: true,
          config: (manifest.config?.parse({}) as Record<string, unknown>) ?? {},
        },
      ];
    }),
  );

for (const manifest of features) {
  test(`${manifest.id}: disabling and re-enabling disposes its extensions and commands, leaving no trace`, async () => {
    const f = fixture();
    const config =
      (manifest.config?.parse({}) as Record<string, unknown>) ?? {};
    const required = settingsOf(providers[manifest.id] ?? []);
    await f.configure(required);
    const baseline = f.root.ledger.snapshot();
    const baseExtensions = f.extensions;
    const baseHandlers = f.handlers.size;
    await f.configure({
      ...required,
      [manifest.id]: { enabled: true, config },
    });
    const fiber = [...f.root.plugins].find(
      (fiber) => fiber.definition.name === manifest.id,
    )!;
    assert.equal(fiber.state, "active", String(fiber.error));
    assert.ok(hasExtensions(f, manifest.id));
    for (const command of manifest.contributes?.commands ?? []) {
      if (!command.editorCommand) {
        continue;
      }
      assert.equal(f.handlers.has(command.editorCommand), true);
    }
    const activeHooks = await renderHooks(f.root);
    const activeMenu = await f.root.pipeline("editor/selectionMenu", []);
    if (manifest.id === "agentBridge") {
      assert.deepEqual(
        activeMenu.map((item) => item.label),
        ["Copy Link for Agent"],
      );
    }
    if (
      [
        "codeBlocks",
        "math",
        "callouts",
        "tasks",
        "embeds",
        "tags",
        "onlineVideos",
      ].includes(manifest.id)
    ) {
      assert.ok(activeHooks.reads > 0);
    }
    if (manifest.id === "footnotes") {
      assert.equal(activeHooks.prepared, true);
    }
    if (manifest.id === "diagrams") {
      assert.equal(activeHooks.fence, true);
    }
    await f.configure(required);
    assert.deepEqual(await renderHooks(f.root), {
      reads: 0,
      prepared: false,
      fence: undefined,
    });
    assert.deepEqual(await f.root.pipeline("editor/selectionMenu", []), []);
    assert.equal(f.extensions, baseExtensions);
    assert.equal(f.handlers.size, baseHandlers);
    // Every effect, listener, child plugin and service it held is gone.
    assert.deepEqual(f.root.ledger.snapshot(), baseline);
    await f.configure({
      ...required,
      [manifest.id]: { enabled: true, config },
    });
    assert.ok(hasExtensions(f, manifest.id));
    assert.deepEqual(await renderHooks(f.root), activeHooks);
    await f.root.dispose();
    assert.equal(f.extensions, 0);
    assert.equal(f.handlers.size, 0);
    assert.deepEqual(f.root.ledger.snapshot(), {});
  });
}

test("the graph's service providers are the plugins that really provide them", async () => {
  const f = fixture();
  await f.configure(settingsFor(new Set(features.map((item) => item.id))));
  const graph = new PluginGraph([
    ...Object.values(hostPlugins),
    ...Object.values(webviewPlugins),
  ] as PluginDeclaration[]);
  for (const [service, owner] of f.root.providers) {
    if (owner !== "root") {
      assert.equal(graph.providers.get(service), owner, service);
    }
  }
  await f.root.dispose();
});

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
  return Object.fromEntries(
    features.map((manifest) => [
      manifest.id,
      {
        enabled: enabled.has(manifest.id),
        config: (manifest.config?.parse({}) ?? {}) as Record<string, unknown>,
      },
    ]),
  );
}
function owners(f: ReturnType<typeof fixture>) {
  const running = new Set(
    [...f.root.plugins].map((fiber) => fiber.definition.name),
  );
  for (const fiber of f.root.plugins) {
    // A feature whose provider is off waits for it, as declared.
    const waiting = (providers[fiber.definition.name] ?? []).some(
      (id) => !running.has(id),
    );
    assert.equal(
      fiber.state,
      waiting ? "pending" : "active",
      `${fiber.definition.name}: ${String(fiber.error)}`,
    );
  }
  return f.registry.ordered().map(({ owner, slot }) => ({ owner, slot }));
}
function composition(f: ReturnType<typeof fixture>) {
  const state = f.view.state;
  const blocks = state.facet(blockRenderers);
  const source = [
    "---",
    "title: Test",
    "---",
    "# Heading",
    "",
    "> [!note]",
    "> Body",
    "",
    "```mermaid",
    "graph TD; A-->B",
    "```",
    "",
    "| A | B |",
    "| - | - |",
    "| C | D |",
    "",
    "![[Note]]",
    "",
    "```query",
    "tag:project",
    "```",
    "",
    "$$",
    "x",
    "$$",
  ].join("\n");
  const sample = EditorState.create({ doc: source });
  const matches: string[] = [];
  markdownParser.parse(source).iterate({
    enter(node) {
      const renderer = blocks.find((renderer) => renderer.match(node, sample));
      if (renderer) {
        matches.push(`${node.name}:${renderer.kind}:${renderer.editing}`);
      }
    },
  });
  return {
    suggestions: ["[[No", "#pro", "[[^^body"].map((doc) =>
      f.root.bail("suggest/trigger", {
        state: EditorState.create({ doc }),
        pos: doc.length,
      }),
    ),
    owners: owners(f),
    keys: state
      .facet(keymap)
      .flat()
      .map((binding) => ({
        key: binding.key,
        mac: binding.mac,
        win: binding.win,
        linux: binding.linux,
        preventDefault: binding.preventDefault,
        stopPropagation: binding.stopPropagation,
      })),
    blocks: blocks.map((renderer) => renderer.kind),
    inline: state.facet(inlineRenderers).map((renderer) => renderer.nodes),
    matches,
    attributes: state
      .facet(ViewFacets.contentAttributes)
      .filter((value) => typeof value !== "function"),
    pairs: state.languageDataAt("closeBrackets", 0),
    folding: state.facet(foldService).map((service) => service(state, 0, 9)),
    indent: state.facet(indentUnit),
    tabSize: state.tabSize,
  };
}

test("catalog composition has the same ordered owners after every toggle as a fresh editor", async () => {
  const f = fixture();
  const fresh = fixture();
  const enabled = new Set(features.map((item) => item.id));
  await fresh.configure(settingsFor(enabled));
  await f.configure(settingsFor(enabled));
  const expected = composition(fresh);
  assert.ok(expected.owners.some(({ owner }) => owner === "tables"));
  assert.ok(expected.matches.includes("FencedCode:query:reveal"));
  for (const manifest of features) {
    enabled.delete(manifest.id);
    await f.configure(settingsFor(enabled));
    assert.equal(
      owners(f).some(({ owner }) => owner === manifest.id),
      false,
    );
    enabled.add(manifest.id);
    await f.configure(settingsFor(enabled));
    assert.deepEqual(composition(f), expected, manifest.id);
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
    if (enabled.has(id)) {
      enabled.delete(id);
    } else {
      enabled.add(id);
    }
    await f.configure(settingsFor(enabled));
  }
  const fresh = fixture();
  await fresh.configure(settingsFor(enabled));
  assert.deepEqual(composition(f), composition(fresh));
  await f.root.dispose();
  await fresh.root.dispose();
});

test("folding owns ranges, restores late and preserves folds across configuration update", async () => {
  const f = fixture();
  f.contributions.restore(
    { folded: [{ from: 9, to: 15 }], future: { x: 1 } },
    "note.md",
  );
  assert.equal(f.view.state.field(foldState, false), undefined);
  await f.configure({ folding: { enabled: true, config: {} } });
  assert.equal(f.view.state.field(foldState).size, 1);
  const fiber = [...f.root.plugins].find(
    (item) => item.definition.name === "folding",
  )!;
  const originalContext = fiber.context;
  const originalState = f.view.state.field(foldState);
  await f.configure({ folding: { enabled: true, config: { heading: false } } });
  assert.equal(fiber.context, originalContext);
  assert.equal(f.view.state.field(foldState), originalState);
  await f.configure({});
  assert.equal(f.view.state.field(foldState, false), undefined);
  assert.equal(foldedRanges(f.view.state).size, 0);
  assert.deepEqual(f.contributions.capture().future, { x: 1 });
  await f.configure({ folding: { enabled: true, config: {} } });
  assert.equal(foldedRanges(f.view.state).size, 1);
  await f.root.dispose();
});

test("catalog configuration changes preserve fresh-start ordered owners", async () => {
  const enabled = new Set(features.map((item) => item.id));
  const f = fixture();
  await f.configure(settingsFor(enabled));
  for (const manifest of features) {
    const settings = settingsFor(enabled);
    const config = settings[manifest.id]!.config;
    for (const [key, value] of Object.entries(config)) {
      if (typeof value === "boolean") {
        config[key] = !value;
      }
      if (key === "display") {
        config[key] = "hidden";
      }
      if (key === "newLinkFormat") {
        config[key] = "relative";
      }
      if (key === "folderNote") {
        config[key] = "index";
      }
    }
    const fiber = [...f.root.plugins].find(
      (item) => item.definition.name === manifest.id,
    )!;
    const context = fiber.context;
    const foldIdentity = f.view.state.field(foldState);
    await f.configure(settings);
    assert.equal(
      [...f.root.plugins].find((item) => item.definition.name === manifest.id),
      fiber,
    );
    assert.equal(
      fiber.context,
      context,
      `${manifest.id} reconfigures in place`,
    );
    assert.equal(f.view.state.field(foldState), foldIdentity);
    const fresh = fixture();
    await fresh.configure(settings);
    assert.deepEqual(composition(f), composition(fresh), manifest.id);
    await fresh.root.dispose();
  }
  await f.root.dispose();
});

test("heading folding queries share metadata by Text identity and invalidate after edits", () => {
  const state = EditorState.create({ doc: "# Head\nbody\n# End" });
  const first = headings(state.doc);
  for (let i = 0; i < 10; i++) {
    foldRange(state, 0, 6, { heading: true, indent: true });
  }
  assert.equal(headings(state.doc), first);
  const next = state.update({
    changes: { from: 0, to: 6, insert: "plain" },
  }).state;
  assert.notEqual(headings(next.doc), first);
  assert.equal(foldRange(next, 0, 5, { heading: true, indent: false }), null);
});

test("each feature leaves core settings and other plugin folds intact when toggled", async () => {
  const f = fixture();
  const enabled = new Set(features.map((item) => item.id));
  await f.configure(settingsFor(enabled));
  for (const manifest of features) {
    const field = f.view.state.field(foldState);
    enabled.delete(manifest.id);
    await f.configure(settingsFor(enabled));
    assert.equal(f.view.state.facet(indentUnit), "   ", manifest.id);
    assert.equal(f.view.state.tabSize, 3, manifest.id);
    assert.equal(f.view.state.readOnly, false, manifest.id);
    if (manifest.id !== "folding") {
      assert.equal(f.view.state.field(foldState), field, manifest.id);
    }
    enabled.add(manifest.id);
    await f.configure(settingsFor(enabled));
    assert.equal(f.view.state.facet(indentUnit), "   ", manifest.id);
  }
  await f.root.dispose();
});

test("fold gutter refreshes on configuration and tab width without requiring an edit", async () => {
  const f = fixture();
  await f.configure({ folding: { enabled: true, config: {} } });
  const initial = f.view.state;
  await f.configure({ folding: { enabled: true, config: { heading: false } } });
  assert.equal(
    foldingChanged({ startState: initial, state: f.view.state }),
    true,
  );
  assert.equal(
    foldingChanged({ startState: f.view.state, state: f.view.state }),
    false,
  );
  const settings = new Compartment();
  const first = EditorState.create({
    extensions: settings.of(EditorState.tabSize.of(4)),
  });
  const second = first.update({
    effects: settings.reconfigure(EditorState.tabSize.of(2)),
  }).state;
  assert.equal(foldingChanged({ startState: first, state: second }), true);
  await f.root.dispose();
});
