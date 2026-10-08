import type { Plugin } from "../../kernel";
import type {} from "../editor/api";
import type {} from "../commands/api";
import type {} from "../livePreview/api";
import type {} from "../render/api";
import { MarkdownBlock } from "../../webview/ui/markdown-widget";
import { MarkdownInline } from "../../webview/ui/inline-widget";
import { sanitizeGraphics } from "../../webview/ui/graphics";
import { mathEdit } from "./commands";
export const mathWebview: Plugin = {
  name: "math",
  inject: { required: ["editor", "commands", "livePreview", "render"] },
  apply(ctx) {
    const cleanups = new Set<() => void>();
    ctx.effect(() => () => {
      for (const cleanup of cleanups) {
        cleanup();
      }
      cleanups.clear();
    });
    ctx.effect(() =>
      ctx.livePreview.block({
        kind: "math",
        editing: "reveal",
        match: (node) => node.name === "MathBlock",
        widget: (block) => new MarkdownBlock(block, ctx.render),
      }),
    );
    ctx.effect(() =>
      ctx.livePreview.inline({
        nodes: ["InlineMath"],
        decorate(node, cx) {
          if (!cx.revealed(node.from, node.to)) {
            cx.replace(
              node.from,
              node.to,
              new MarkdownInline(
                cx.state.sliceDoc(node.from, node.to),
                ctx.render,
              ),
            );
          }
        },
      }),
    );
    ctx.on("render/postProcess", (pass) => {
      for (const node of pass.container.querySelectorAll<HTMLElement>(
        "[data-math]",
      )) {
        const original = node.textContent;
        let active = true;
        const cleanup = () => {
          active = false;
          node.textContent = original;
          cleanups.delete(cleanup);
        };
        cleanups.add(cleanup);
        pass.onDispose(cleanup);
        const expression = decodeURIComponent(node.dataset.math ?? "");
        void import("./mathjax")
          .then(({ typeset }) =>
            typeset(expression, node.dataset.display === "true"),
          )
          .then((html) => {
            if (!active) {
              return;
            }
            node.innerHTML = sanitizeGraphics(html);
            node.setAttribute("aria-label", expression);
            pass.measure();
          })
          .catch((error) => {
            if (!active) {
              return;
            }
            node.classList.add("render-error");
            node.title = String(error);
            ctx.logger.warn("Math rendering failed", error);
          });
      }
    });
    for (const [id, block] of [
      ["editor:toggle-inline-math", false],
      ["editor:insert-mathblock", true],
    ] as const) {
      ctx.effect(() =>
        ctx.commands.register(id, () => {
          ctx.editor.view.dispatch(mathEdit(ctx.editor.view.state, block));
          return true;
        }),
      );
    }
  },
};
