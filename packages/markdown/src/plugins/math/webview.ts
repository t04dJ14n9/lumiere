import type { Context, Infer, Plugin } from "@workshop/core";
import type {} from "../editor/api";
import type {} from "../commands/api";
import type {} from "../formatting/api";
import type { InlineContext } from "../livePreview/api";
import type { RenderPass } from "../render/api";
import { MarkdownBlock } from "../../webview/ui/markdown-widget";
import {
  MarkdownInline,
  type InlineClick,
} from "../../webview/ui/inline-widget";
import { sanitizeGraphics } from "../../webview/ui/graphics";
import { inlineMathEdit, mathBlockEdit } from "./commands";
import { delimiters, mathBody, mathTokens } from "./source";
import { errorMessage } from "../../shared/errors";
import { config } from "./manifest";
interface MathMount {
  macros: Record<string, string>;
}

const mounts = new WeakMap<Context, MathMount>();

export const mathWebview: Plugin<Infer<typeof config>> = {
  name: "math",
  config,
  inject: {
    required: ["editor", "commands", "livePreview", "render"],
    optional: ["formatting"],
  },
  // Features re-renders after settings change; rebuild MathJax macros first.
  reconfigure(ctx, options) {
    const mount = mounts.get(ctx);
    if (!mount) {
      return false;
    }
    mount.macros = options.macros;
    void import("./mathjax").then(({ setUserMacros }) =>
      setUserMacros(mount.macros),
    );
    return true;
  },
  apply(ctx, options) {
    const mount: MathMount = { macros: options.macros };
    mounts.set(ctx, mount);
    void import("./mathjax").then(({ setUserMacros }) =>
      setUserMacros(mount.macros),
    );
    const cleanups = registerMathCleanup(ctx);
    registerMathRenderers(ctx);
    registerTypesetting(ctx, cleanups, mount);
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
      // BH-009 / BH-004: revealed block math is source only (no preview stacked
      // under the $$ lines). Obsidian keeps a live preview below; we prefer a
      // single coherent view while editing, like callouts and HTML blocks.
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

function registerTypesetting(
  ctx: Context,
  cleanups: Set<() => void>,
  mount: MathMount,
): void {
  ctx.on("render/postProcess", (pass) => {
    for (const node of pass.container.querySelectorAll<HTMLElement>(
      "[data-math]",
    )) {
      typesetNode({ node, pass, cleanups, logger: ctx.logger, mount });
    }
  });
}

function registerMathCommands(ctx: Context): void {
  const view = ctx.editor.view;
  // Inline math toggles like bold: the word at the caret, each line of a
  // selection, or off again, through the formatting plugin when it runs.
  ctx.effect(() =>
    ctx.commands.register("editor:toggle-inline-math", () => {
      if (ctx.formatting) {
        return ctx.formatting.wrap("$", view);
      }
      view.dispatch(inlineMathEdit(view.state));
      return true;
    }),
  );
  ctx.effect(() =>
    ctx.commands.register("editor:insert-mathblock", () => {
      view.dispatch(mathBlockEdit(view.state));
      return true;
    }),
  );
}

interface TypesetOptions {
  node: HTMLElement;
  pass: RenderPass;
  cleanups: Set<() => void>;
  logger: Context["logger"];
  mount: MathMount;
}

function typesetNode({
  node,
  pass,
  cleanups,
  logger,
  mount,
}: TypesetOptions): void {
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
    .then(({ typeset, setUserMacros }) => {
      setUserMacros(mount.macros);
      return typeset(expression, node.dataset.display === "true");
    })
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
