import type { Context, Plugin } from "../../kernel";
import type {} from "../editor/api";
import type {} from "../commands/api";
import type {} from "../livePreview/api";
import type { RenderPass } from "../render/api";
import { MarkdownBlock } from "../../webview/ui/markdown-widget";
import { MarkdownInline } from "../../webview/ui/inline-widget";
import { sanitizeGraphics } from "../../webview/ui/graphics";
import { mathEdit } from "./commands";
import { errorMessage } from "../../shared/errors";
export const mathWebview: Plugin = {
  name: "math",
  inject: { required: ["editor", "commands", "livePreview", "render"] },
  apply(ctx) {
    const cleanups = registerMathCleanup(ctx);
    registerMathRenderers(ctx);
    registerTypesetting(ctx, cleanups);
    registerMathCommands(ctx);
  },
};

function registerMathRenderers(ctx: Context): void {
  ctx.effect(() =>
    ctx.livePreview.block({
      kind: "math",
      editing: "reveal",
      match: (node) => node.name === "MathBlock",
      editingPreview: { sourceClass: "md-math-source" },
      widget: (block) => new MarkdownBlock(block, ctx.render),
    }),
  );
  ctx.effect(() =>
    ctx.livePreview.inline({
      nodes: ["InlineMath"],
      decorate(node, cx) {
        if (cx.revealed(node.from, node.to)) {
          // Revealed source reads as code, as in Obsidian.
          cx.mark(node.from, node.to, "md-math-source-inline");
        } else {
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
}

function registerMathCleanup(ctx: Context): Set<() => void> {
  const cleanups = new Set<() => void>();
  ctx.effect(() => () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
    cleanups.clear();
  });
  return cleanups;
}

function registerTypesetting(ctx: Context, cleanups: Set<() => void>): void {
  ctx.on("render/postProcess", (pass) => {
    for (const node of pass.container.querySelectorAll<HTMLElement>(
      "[data-math]",
    )) {
      typesetNode({ node, pass, cleanups, logger: ctx.logger });
    }
  });
}

function registerMathCommands(ctx: Context): void {
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
}

interface TypesetOptions {
  node: HTMLElement;
  pass: RenderPass;
  cleanups: Set<() => void>;
  logger: Context["logger"];
}

function typesetNode({ node, pass, cleanups, logger }: TypesetOptions): void {
  const original = node.textContent;
  // A disposed pass must not receive the result of a lazy MathJax load.
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
    .then(({ typeset }) => typeset(expression, node.dataset.display === "true"))
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
      node.title = errorMessage(error);
      logger.warn("Math rendering failed", error);
    });
}
