import { EditorView, type ViewUpdate } from "@codemirror/view";
import type { Context, Plugin } from "@workshop/core";
import type {} from "../commands/api";
import type {} from "../editor/api";
import type {} from "../livePreview/api";
import type {} from "../render/api";
import {
  FENCED_PREVIEW,
  MarkdownBlock,
} from "../../webview/ui/markdown-widget";
import type { ObsidianCommand } from "./obsidian-workspace";
import { protocol } from "./protocol";
import { ObsidianRuntime } from "./runtime";

export { ObsidianRuntime } from "./runtime";
export * from "./obsidian-module";

function createWebviewRuntime(ctx: Context): ObsidianRuntime {
  const runtime: ObsidianRuntime = new ObsidianRuntime({
    getEditorView: () => ctx.editor.view,
    registerEditorExtension: (ext) => ctx.editor.extend(ext),
    registerCommand: (cmd: ObsidianCommand): (() => void) =>
      ctx.commands.register(`obsidian:${cmd.id}`, (): boolean =>
        runtime.app.commands.executeCommand(cmd),
      ),
    renderMarkdown: async (markdown, el, sourcePath) => {
      await ctx.render.into(el, markdown, { documentUri: sourcePath });
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

function registerCodeBlockIntegration(
  ctx: Context,
  runtime: ObsidianRuntime,
): void {
  ctx.effect(() =>
    ctx.livePreview.block({
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
    }),
  );

  ctx.on("render/fence", (fence, pass) => {
    const lang = fence.language.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    if (!runtime.getCodeBlockLanguages().includes(lang)) {
      return undefined;
    }
    const sourcePath = pass.documentUri ?? ctx.editor.source;
    void runtime.runCodeBlockProcessors(
      lang,
      fence.source,
      fence.element,
      sourcePath,
    );
    return true;
  });

  ctx.on("render/postProcess", async (pass) => {
    const sourcePath = pass.documentUri ?? ctx.editor.source;
    await runtime.runPostProcessors(pass.container, sourcePath);
  });
}

export const obsidianCompatWebview: Plugin = {
  name: "obsidianCompat",
  inject: { required: ["editor", "livePreview", "render", "commands", "rpc"] },
  apply(ctx: Context) {
    const runtime = createWebviewRuntime(ctx);
    (globalThis as Record<string, unknown>).__lumiereObsidianRuntime = runtime;

    registerCodeBlockIntegration(ctx, runtime);

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
        void runtime.syncCommunityPlugins(plugins);
      }),
    );

    runtime.syncDocument(
      ctx.editor.source,
      ctx.editor.view.state.doc.toString(),
    );
    void ctx.rpc
      .call(protocol, "bootstrap", {})
      .then((snapshot) => runtime.applyBootstrap(snapshot))
      .catch(() => {});

    ctx.effect(() => () => {
      runtime.dispose();
    });
  },
};
