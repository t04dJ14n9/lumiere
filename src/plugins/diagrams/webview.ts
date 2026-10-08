import type { Plugin } from "../../kernel";
import type {} from "../livePreview/api";
import type {} from "../render/api";
import { MarkdownBlock } from "../../webview/ui/markdown-widget";
import { sanitizeGraphics } from "../../webview/ui/graphics";
export function diagramLanguage(info: string): boolean {
  return info.trim().split(/\s+/)[0]?.toLowerCase() === "mermaid";
}
export const diagramsWebview: Plugin = {
  name: "diagrams",
  inject: { required: ["livePreview", "render"] },
  apply(ctx) {
    const prefix = `mw-${Array.from(crypto.getRandomValues(new Uint32Array(2)), (value) => value.toString(16)).join("-")}`;
    let sequence = 0;
    let queue = Promise.resolve();
    const cleanups = new Set<() => void>();
    ctx.effect(() => () => {
      for (const cleanup of cleanups) {
        cleanup();
      }
      cleanups.clear();
    });
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
    ctx.on("render/fence", (fence, pass) => {
      if (!diagramLanguage(fence.language)) {
        return undefined;
      }
      let active = true;
      const original = fence.element.innerHTML;
      const cleanup = () => {
        active = false;
        fence.element.innerHTML = original;
        cleanups.delete(cleanup);
      };
      cleanups.add(cleanup);
      pass.onDispose(cleanup);
      queue = queue
        .then(async () => {
          if (!active) {
            return;
          }
          const { default: mermaid } = await import("mermaid");
          if (!active) {
            return;
          }
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            htmlLabels: false,
            flowchart: { htmlLabels: false },
            suppressErrorRendering: true,
            theme: document.body.classList.contains("vscode-light")
              ? "default"
              : "dark",
          });
          const result = await mermaid.render(
            `${prefix}-${++sequence}`,
            fence.source,
          );
          if (!active) {
            return;
          }
          fence.element.innerHTML = sanitizeGraphics(result.svg);
          fence.element.setAttribute("aria-label", "Mermaid diagram");
          pass.measure();
        })
        .catch((error) => {
          if (active) {
            fence.element.title = String(error);
            ctx.logger.warn("Diagram rendering failed", error);
          }
        });
      return true;
    });
  },
};
