import type { Context, Plugin } from "@workshop/core";
import type {} from "../editor/api";
import type {} from "../commands/api";
import type { InlineContext } from "../livePreview/api";
import type { RenderPass } from "../render/api";
import { MarkdownBlock } from "../../webview/ui/markdown-widget";
import {
  MarkdownInline,
  type InlineClick,
} from "../../webview/ui/inline-widget";
import { sanitizeGraphics } from "../../webview/ui/graphics";
import { mathEdit } from "./commands";
import { delimiters, mathBody, mathTokens } from "./source";
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

/** As in Obsidian, a click on a formula selects it without its `$`. */
const SELECT_FORMULA: InlineClick = { select: mathBody };

function registerMathRenderers(ctx: Context): void {
  const editing = { reveal: "click", select: mathBody } as const;
  ctx.effect(() =>
    ctx.livePreview.block({
      kind: "math",
      nodes: ["MathBlock"],
      editing: "reveal",
      match: (node) => node.name === "MathBlock",
      // As in Obsidian, editing keeps the rendered formula below its source.
      editingPreview: { sourceClass: "md-math-source" },
      widget: (block) => new MarkdownBlock(block, ctx.render, editing),
    }),
  );
  ctx.effect(() =>
    ctx.livePreview.inline({
      // Block math too: its revealed source is marked like inline math.
      nodes: ["InlineMath", "MathBlock"],
      decorate(node, cx) {
        const source = cx.state.sliceDoc(node.from, node.to);
        if (cx.revealed(node.from, node.to)) {
          markMathSource(cx, node.from, source);
        } else if (node.name === "InlineMath") {
          cx.replace(
            node.from,
            node.to,
            new MarkdownInline(source, ctx.render, SELECT_FORMULA),
          );
        }
      },
    }),
  );
}

/**
 * Revealed math reads as highlighted code, its delimiters in the accent
 * colour, as in Obsidian.
 */
function markMathSource(cx: InlineContext, from: number, source: string): void {
  const { width, closed } = delimiters(source);
  const end = from + source.length;
  const bodyEnd = closed ? end - width : end;
  cx.mark(from, from + width, "md-math md-math-delimiter");
  cx.mark(from + width, bodyEnd, "md-math");
  const body = from + width;
  for (const token of mathTokens(source.slice(width, bodyEnd - from))) {
    cx.mark(body + token.from, body + token.to, `md-math-${token.type}`);
  }
  if (closed) {
    cx.mark(bodyEnd, end, "md-math md-math-delimiter");
  }
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
