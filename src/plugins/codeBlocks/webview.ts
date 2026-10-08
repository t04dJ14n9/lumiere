import { registerProcessors } from "./processor-view";
import type { Context, Plugin } from "../../kernel";
import type {} from "../editor/api";
import type {} from "../render/api";
import type {} from "../livePreview/api";
import { MarkdownBlock } from "../../webview/ui/markdown-widget";
import { codeSource } from "./code-source";
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
    ctx.effect(() => ctx.editor.extend(codeSource));
    registerCodeBlocks(ctx);
    registerProcessors(ctx);
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

function registerCodeBlocks(ctx: Context): void {
  for (const kind of ["CodeBlock", "FencedCode"]) {
    ctx.effect(() =>
      ctx.livePreview.block({
        kind,
        editing: "reveal",
        match: (node) => node.name === kind,
        widget: (block) => new MarkdownBlock(block, ctx.render),
      }),
    );
  }
}
