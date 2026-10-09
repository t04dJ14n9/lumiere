import { registerProcessors } from "./processor-view";
import type { Context, Disposer, Plugin } from "../../kernel";
import type {} from "../editor/api";
import type {} from "../render/api";
import type {} from "../livePreview/api";
import { MarkdownBlock } from "../../webview/ui/markdown-widget";
import { codeSource } from "./code-source";
import { codeBlockRange } from "./range";
import { bindCodePass } from "./post-process";
export const codeBlocksWebview: Plugin = {
  name: "codeBlocks",
  inject: { required: ["editor", "livePreview", "render", "rpc"] },
  apply(ctx) {
    const cleanups = new Set<() => void>();
    let live = true;
    ctx.effect(() => () => {
      live = false;
      for (const cleanup of cleanups) {
        cleanup();
      }
      cleanups.clear();
    });
    ctx.effect(() =>
      ctx.editor.extend(
        codeSource((text) => {
          void ctx.editor.clipboard
            .write(text)
            .catch((error) => ctx.logger.error("Copy failed", error));
        }),
      ),
    );
    registerProcessors(ctx, (accepts) => registerProcessedBlocks(ctx, accepts));
    ctx.on("render/postProcess", (pass) => {
      bindCodePass({
        pass,
        cleanups,
        isLive: () => live,
        editor: ctx.editor,
        logger: ctx.logger,
      });
    });
  },
};

/**
 * Plain code stays decorated source lines (code-source.ts and Live Preview's
 * code lines), so it never jumps when the caret enters. Only fences a code
 * processor (another extension) renders are replaced by their output.
 */
function registerProcessedBlocks(
  ctx: Context,
  accepts: (language: string) => boolean,
): Disposer {
  return ctx.livePreview.block({
    kind: "FencedCode",
    nodes: ["FencedCode"],
    editing: "reveal",
    match: (node, state) => {
      if (node.name !== "FencedCode") {
        return false;
      }
      const info = node.node.getChild("CodeInfo");
      const language =
        info && /^[\w-]+/.exec(state.sliceDoc(info.from, info.to))?.[0];
      return !!language && accepts(language);
    },
    range: codeBlockRange,
    widget: (block) => new MarkdownBlock(block, ctx.render),
  });
}
