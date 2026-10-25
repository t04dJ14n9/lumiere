import { EditorView, type ViewUpdate } from "@codemirror/view";
import type { Context, Disposer, Plugin } from "@workshop/core";
import type {} from "../commands/api";
import type {} from "../editor/api";
import type {} from "../livePreview/api";
import type {} from "../render/api";
import {
  FENCED_PREVIEW,
  MarkdownBlock,
} from "../../webview/ui/markdown-widget";
import { Component } from "./obsidian-core";
import type { ObsidianCommand } from "./obsidian-workspace";
import { protocol } from "./protocol";
import { ObsidianRuntime } from "./runtime";

export { ObsidianRuntime } from "./runtime";
export * from "./obsidian-module";

function createCommandRegistrar(
  ctx: Context,
  getRuntime: () => ObsidianRuntime,
): (cmd: ObsidianCommand) => () => void {
  const disposers = new Map<string, Disposer>();
  return (cmd: ObsidianCommand): (() => void) => {
    const id = `obsidian:${cmd.id}`;
    void disposers.get(id)?.();
    const dispose = ctx.commands.register(id, (): boolean =>
      getRuntime().app.commands.executeCommand(cmd),
    );
    disposers.set(id, dispose);
    return () => {
      if (disposers.get(id) === dispose) {
        disposers.delete(id);
        void dispose();
      }
    };
  };
}

function createWebviewRuntime(ctx: Context): ObsidianRuntime {
  const runtime: ObsidianRuntime = new ObsidianRuntime({
    getEditorView: () => ctx.editor.view,
    registerEditorExtension: (ext) => ctx.editor.extend(ext),
    registerCommand: createCommandRegistrar(ctx, () => runtime),
    renderMarkdown: async (markdown, el, sourcePath) => {
      const temp = el.ownerDocument.createElement("div");
      await ctx.render.into(
        temp,
        markdown,
        sourcePath.includes("://") ? { documentUri: sourcePath } : {},
      );
      while (temp.firstChild) {
        el.appendChild(temp.firstChild);
      }
    },
    loadPluginData: async (pluginId) =>
      (await ctx.rpc.call(protocol, "loadPluginData", { pluginId })).data,
    savePluginData: async (pluginId, data) => {
      await ctx.rpc.call(protocol, "savePluginData", {
        pluginId,
        data,
      });
    },
    vault: {
      read: async (path) =>
        (await ctx.rpc.call(protocol, "vaultRead", { path })).content,
      modify: async (path, data) =>
        ctx.rpc.call(protocol, "vaultModify", { path, data }),
      create: async (path, data) =>
        ctx.rpc.call(protocol, "vaultCreate", { path, data }),
      createFolder: async (path) => {
        await ctx.rpc.call(protocol, "vaultCreateFolder", { path });
      },
      delete: async (path) => {
        await ctx.rpc.call(protocol, "vaultDelete", { path });
      },
      rename: async (path, newPath) => {
        await ctx.rpc.call(protocol, "vaultRename", { path, newPath });
      },
      exists: async (path) => ctx.rpc.call(protocol, "vaultExists", { path }),
    },
    workspace: {
      getEditorView: () => ctx.editor.view,
      openLinkText: async (linktext, sourcePath, newLeaf) => {
        await ctx.rpc.call(protocol, "openLinkText", {
          linktext,
          sourcePath,
          ...(typeof newLeaf === "boolean" ? { newLeaf } : {}),
        });
      },
    },
  });
  return runtime;
}

function bindCodeBlockRenderer(
  ctx: Context,
  runtime: ObsidianRuntime,
): Disposer {
  return ctx.livePreview.block({
    kind: "obsidian-codeblock",
    nodes: ["FencedCode"],
    editing: "reveal",
    match(node, state) {
      if (node.name !== "FencedCode") {
        return false;
      }
      const info = node.node.getChild("CodeInfo");
      if (!info) {
        return false;
      }
      const lang = state
        .sliceDoc(info.from, info.to)
        .trim()
        .split(/\s+/)[0]
        ?.toLowerCase();
      return Boolean(lang && runtime.getCodeBlockLanguages().includes(lang));
    },
    widget: (block) => new MarkdownBlock(block, ctx.render, FENCED_PREVIEW),
  });
}

function observeAsyncFenceRender(
  el: HTMLElement,
  pass: {
    measure?: (() => void) | undefined;
    onDispose: (fn: () => void) => void;
  },
): Component {
  const component = new Component();
  void component.load();
  if (typeof MutationObserver !== "undefined") {
    const observer = new MutationObserver(() => {
      pass.measure?.();
    });
    observer.observe(el, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    pass.onDispose(() => {
      observer.disconnect();
    });
  }
  pass.onDispose(() => {
    component.unload();
  });
  return component;
}

function registerCodeBlockIntegration(
  ctx: Context,
  runtime: ObsidianRuntime,
): () => void {
  let unblock: Disposer | undefined;
  let live = true;
  const bindBlock = (): Disposer => bindCodeBlockRenderer(ctx, runtime);
  unblock = bindBlock();
  ctx.effect(() => () => {
    live = false;
    void unblock?.();
    unblock = undefined;
  });

  ctx.on("render/fence", (fence, pass) => {
    const lang = fence.language.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    if (!runtime.getCodeBlockLanguages().includes(lang)) {
      return undefined;
    }
    fence.element.replaceChildren();
    fence.element.classList.add(`block-language-${lang}`);
    const sourcePath = pass.documentUri ?? ctx.editor.source;
    const component = observeAsyncFenceRender(fence.element, pass);
    void runtime
      .runCodeBlockProcessors(
        lang,
        fence.source,
        fence.element,
        sourcePath,
        component,
      )
      .then(() => {
        pass.measure?.();
      });
    return true;
  });

  ctx.on("render/postProcess", async (pass) => {
    const sourcePath = pass.documentUri ?? ctx.editor.source;
    await runtime.runPostProcessors(pass.container, sourcePath);
  });

  return () => {
    if (!live) {
      return;
    }
    void unblock?.();
    unblock = bindBlock();
    ctx.emit("render/changed");
  };
}

export const obsidianCompatWebview: Plugin = {
  name: "obsidianCompat",
  inject: { required: ["editor", "livePreview", "render", "commands", "rpc"] },
  apply(ctx: Context) {
    const runtime = createWebviewRuntime(ctx);
    (globalThis as Record<string, unknown>).__lumiereObsidianRuntime = runtime;

    const refreshBlocks = registerCodeBlockIntegration(ctx, runtime);

    ctx.effect(() =>
      ctx.editor.extend(
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (update.docChanged) {
            runtime.syncDocument(
              ctx.editor.source,
              update.state.doc.toString(),
            );
          }
        }),
      ),
    );

    ctx.effect(() =>
      ctx.rpc.on(protocol, "vaultChanged", ({ files }) => {
        runtime.syncVaultFiles(files);
      }),
    );

    ctx.effect(() =>
      ctx.rpc.on(protocol, "pluginsChanged", ({ trusted, plugins }) => {
        runtime.setTrusted(trusted);
        void runtime.syncCommunityPlugins(plugins).then(() => refreshBlocks());
      }),
    );

    void ctx.rpc
      .call(protocol, "bootstrap", {})
      .then(async (snapshot) => {
        await runtime.applyBootstrap(snapshot);
        runtime.syncDocument(
          ctx.editor.source,
          ctx.editor.view.state.doc.toString(),
        );
        refreshBlocks();
      })
      .catch(() => {});

    ctx.effect(() => () => {
      runtime.dispose();
    });
  },
};
