import assert from "node:assert/strict";
import { Compartment, EditorState } from "@codemirror/state";
import type { TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { createRoot, bindCaller } from "@workshop/core";
import type { CallerBound } from "@workshop/core";
import { Endpoint } from "../../../src/shared/rpc/endpoint";
import { featureController } from "../../../src/webview/features";
import { pluginRank } from "../../../src/plugins/catalog";
import type { EditorService } from "../../../src/plugins/editor/api";
import type { MarkdownService } from "../../../src/plugins/dialect/api";
import type { LivePreview } from "../../../src/plugins/livePreview/api";
import { ViewContributions } from "../../../src/plugins/editor/contributions";
import { ExtensionRegistry } from "../../../src/plugins/editor/extensions";
import { caretExtension } from "../../../src/plugins/editor/caret-view";
import {
  settingsExtensions,
  editorSettings,
} from "../../../src/plugins/editor/settings";
import {
  blockRenderers,
  inlineRenderers,
} from "../../../src/plugins/livePreview/registry";
export function fixture() {
  const root = createRoot({ rank: pluginRank });
  const compartment = new Compartment();
  let state = EditorState.create({
    doc: "# Heading\n\nbody",
    extensions: [
      settingsExtensions({ useTabs: false, tabSize: 3 }),
      compartment.of([]),
    ],
  });
  const view = {
    dom: new EventTarget(),
    scrollDOM: new EventTarget(),
    get state() {
      return state;
    },
    dispatch(spec: TransactionSpec) {
      state = state.update(spec).state;
    },
  } as unknown as EditorView;
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
    block() {
      throw new Error("unbound renderer");
    },
    inline() {
      throw new Error("unbound renderer");
    },
    [bindCaller](caller) {
      const owner = caller.owner;
      return {
        ...preview,
        block: (renderer) =>
          registry.register(owner, blockRenderers.of(renderer)),
        inline: (renderer) =>
          registry.register(owner, inlineRenderers.of(renderer)),
      };
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
        const message = value as {
          kind: string;
          id: number;
          channel: string;
          method: string;
        };
        if (message.kind === "request") {
          queueMicrotask(() =>
            receive({
              kind: "response",
              id: message.id,
              result: (
                {
                  markers: { version: 0, revision: 0, owners: {} },
                  codeBlocks: { epoch: 0, revision: 0, languages: [] },
                  editorActions: [],
                  links: message.method === "unresolved" ? [] : true,
                } as Record<string, unknown>
              )[message.channel] ?? { fragment: "" },
            }),
          );
        }
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
  const contributions = new ViewContributions(view);
  const editor: EditorService & CallerBound<EditorService> = {
    [bindCaller](caller) {
      return {
        ...editor,
        extend: (extension, options) =>
          registry.register(
            options?.owner ?? caller.owner,
            extension,
            options?.slot,
          ),
      };
    },
    view,
    navigate: (jump) => jump(),
    onNavigate: () => () => {},
    settled: async () => true,
    caret(source) {
      return caretExtension({
        ...source,
        settings: () => view.state.facet(editorSettings),
      });
    },
    get settings() {
      return view.state.facet(editorSettings);
    },
    mode: "source",
    source: "note.md",
    viewState: contributions,
    focus() {},
    clipboard: {
      async read() {
        return "";
      },
      async write() {},
    },
    extend(extension, options) {
      return registry.register(
        options?.owner ?? "editor",
        extension,
        options?.slot,
      );
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
    contributions,
    handlers,
    configure: featureController(root),
    get extensions() {
      return extensions + registry.ordered().length;
    },
  };
}
