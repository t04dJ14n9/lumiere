import {
  bindCaller,
  type CallerBound,
  type Context,
  type Disposer,
  type Plugin,
} from "@workshop/core";
import type {} from "../editor/api";
import type {} from "../vault/api";
import type { CodeBlocks } from "./api";
import { protocol } from "./protocol";
import { ProcessorRegistry } from "./processors";
import { RpcError } from "../../shared/rpc/lifecycle";
export const codeBlocksHost: Plugin = {
  name: "codeBlocks",
  inject: {
    required: ["editors", "settings", "workspace"],
    optional: ["vaults"],
  },
  apply(ctx) {
    const registry = new ProcessorRegistry(() => {
      for (const panel of ctx.editors.all()) {
        panel.rpc.notify(
          protocol,
          "changed",
          availableProcessors(ctx, registry, panel.id),
        );
      }
    });
    const service: CodeBlocks & CallerBound<CodeBlocks> = {
      register: (processor) => registry.register("codeBlocks", processor),
      [bindCaller](caller) {
        const owner = caller.owner;
        let live = true;
        caller.effect(() => () => {
          live = false;
          registry.clearOwner(owner);
        });
        return {
          register(processor) {
            if (!live) {
              throw new RpcError(
                "PluginDisabled",
                "Processor provider stopped",
              );
            }
            return registry.register(owner, processor);
          },
        };
      },
    };
    ctx.provide("codeBlocks", service);
    registerProcessorPanels(ctx, registry);
    ctx.effect(() => () => registry.dispose());
    ctx.effect(() =>
      ctx.settings.onChange(() => {
        for (const panel of ctx.editors.all()) {
          panel.rpc.notify(
            protocol,
            "changed",
            availableProcessors(ctx, registry, panel.id),
          );
        }
      }),
    );
  },
};
function registerProcessorPanels(
  ctx: Context,
  registry: ProcessorRegistry,
): void {
  const handlers = new Map<string, Disposer[]>();
  const register = (id: string) => {
    const panel = ctx.editors.all().find((panel) => panel.id === id);
    if (!panel || handlers.has(id)) {
      return;
    }
    handlers.set(id, [
      panel.rpc.handle(protocol, "current", () =>
        availableProcessors(ctx, registry, id),
      ),
      panel.rpc.handle(protocol, "render", async (request, token) => {
        assertProcessorAccess(ctx, id);
        if (request.uri !== panel.document.uri) {
          const vault = await ctx.vaults?.forDocument(panel.document.uri);
          const path = vault?.pathOf(request.uri);
          if (!path || vault?.index.file(path)?.uri !== request.uri) {
            throw new RpcError("InvalidArgument", "Unknown code block source");
          }
        }
        assertProcessorAccess(ctx, id);
        return registry.render({ ...request, editorId: id }, token);
      }),
    ]);
  };
  ctx.on("editor/opened", (panel) => register(panel.id));
  ctx.on("editor/closed", (panel) => {
    for (const stop of handlers.get(panel.id) ?? []) {
      void stop();
    }
    handlers.delete(panel.id);
  });
  ctx.effect(() => () => {
    for (const stops of handlers.values()) {
      for (const stop of stops) {
        void stop();
      }
    }
    handlers.clear();
  });
  for (const panel of ctx.editors.all()) {
    register(panel.id);
  }
}

function assertProcessorAccess(ctx: Context, id: string): void {
  if (!ctx.workspace.isTrusted()) {
    throw new RpcError(
      "WorkspaceUntrusted",
      "Code processors require a trusted workspace",
    );
  }
  const panel = ctx.editors.all().find((panel) => panel.id === id);
  if (!panel) {
    throw new RpcError("EditorNotFound", "Editor closed");
  }
  const config = ctx.settings.forNote(panel.document);
  if (
    config.preset !== "obsidian" ||
    config.features?.codeBlocks?.enabled === false
  ) {
    throw new RpcError("PluginDisabled", "Code blocks are disabled");
  }
}
function availableProcessors(
  ctx: Context,
  registry: ProcessorRegistry,
  id: string,
) {
  const value = registry.snapshot(id);
  try {
    assertProcessorAccess(ctx, id);
    return value;
  } catch {
    return { ...value, languages: [] };
  }
}
