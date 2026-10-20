import type { Context, Plugin } from "@workshop/core";
import type {} from "../livePreview/api";
import type {} from "../render/api";
import type {} from "../editor/api";
import {
  FENCED_PREVIEW,
  MarkdownBlock,
} from "../../webview/ui/markdown-widget";
import { QueryClient } from "./client";
import { bindSearchBlock } from "./blocks";
import { queryEstimatedHeight } from "./estimated-height";
import { protocol } from "./protocol";
export const searchWebview: Plugin = {
  name: "search",
  inject: { required: ["editor", "rpc", "render", "livePreview"] },
  apply(ctx) {
    const client = new QueryClient(ctx.rpc);
    ctx.effect(() => () => client.dispose());
    ctx.effect(() => ctx.rpc.on(protocol, "changed", () => client.refresh()));
    registerQueryBlocks(ctx);
    registerQueryFences(ctx, client);
  },
};
function isQuery(language: string): boolean {
  return language.trim().split(/\s+/)[0]?.toLowerCase() === "query";
}
function registerQueryBlocks(ctx: Context): void {
  ctx.effect(() =>
    ctx.livePreview.block({
      kind: "query",
      nodes: ["FencedCode"],
      editing: "reveal",
      match(node, state) {
        const info = node.node.getChild("CodeInfo");
        return (
          node.name === "FencedCode" &&
          !!info &&
          isQuery(state.sliceDoc(info.from, info.to))
        );
      },
      widget: (block) => new QueryBlock(block, ctx.render, FENCED_PREVIEW),
    }),
  );
}

/** MarkdownBlock with a results-sized height reserve for off-viewport remounts. */
class QueryBlock extends MarkdownBlock {
  override get estimatedHeight(): number {
    return queryEstimatedHeight(this.block.source);
  }
}

function registerQueryFences(ctx: Context, client: QueryClient): void {
  const cleanups = new Set<() => void>();
  ctx.effect(() => () => {
    for (const stop of cleanups) {
      stop();
    }
    cleanups.clear();
  });
  ctx.on("render/fence", (fence, pass) => {
    if (!isQuery(fence.language)) {
      return undefined;
    }
    const dispose = bindSearchBlock(
      fence,
      pass,
      client,
      pass.documentUri ?? ctx.editor.source,
    );
    const stop = () => {
      dispose();
      cleanups.delete(stop);
    };
    cleanups.add(stop);
    pass.onDispose(stop);
    return true;
  });
}
