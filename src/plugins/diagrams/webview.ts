import type { Context, Plugin } from "../../kernel";
import type {} from "../livePreview/api";
import type {} from "../render/api";
import { MarkdownBlock } from "../../webview/ui/markdown-widget";
import { DiagramRenderer } from "./renderer";
export function diagramLanguage(info: string): boolean {
  return info.trim().split(/\s+/)[0]?.toLowerCase() === "mermaid";
}
export const diagramsWebview: Plugin = {
  name: "diagrams",
  inject: { required: ["livePreview", "render"] },
  apply(ctx) {
    const renderer = new DiagramRenderer(ctx.logger);
    ctx.effect(() => () => renderer.dispose());
    registerDiagramBlocks(ctx);
    registerDiagramFences(ctx, renderer);
  },
};

function registerDiagramBlocks(ctx: Context): void {
  ctx.effect(() =>
    ctx.livePreview.block({
      kind: "diagram",
      editing: "reveal",
      match(node, state) {
        const info = node.node.getChild("CodeInfo");
        return (
          node.name === "FencedCode" &&
          Boolean(info && diagramLanguage(state.sliceDoc(info.from, info.to)))
        );
      },
      widget: (block) => new MarkdownBlock(block, ctx.render),
    }),
  );
}

function registerDiagramFences(ctx: Context, renderer: DiagramRenderer): void {
  ctx.on("render/fence", (fence, pass) => {
    if (!diagramLanguage(fence.language)) {
      return undefined;
    }
    renderer.render(fence, pass);
    return true;
  });
}
