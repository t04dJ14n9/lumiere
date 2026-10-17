import type {} from "../editor/api";
import createDOMPurify from "dompurify";
import { sanitizerOptions } from "./sanitizer-options";
import type { Context, Plugin } from "@workshop/core";
import type {} from "../dialect/api";
import type { RenderPass, RenderService } from "./api";
import { createRenderPass } from "./pass";
import { constrainRemoteContent } from "./security";

export const renderWebview: Plugin<{ trusted: boolean }> = {
  name: "render",
  inject: { required: ["markdown", "editor"] },
  apply(ctx, config) {
    const passes = new Set<RenderPass>();
    registerPassCleanup(ctx, passes);
    ctx.provide(
      "render",
      renderService({ ctx, trusted: config.trusted, passes }),
    );
  },
};

function registerPassCleanup(ctx: Context, passes: Set<RenderPass>): void {
  ctx.effect(() => async () => {
    for (const pass of passes) {
      await pass.dispose();
    }
  });
}

function renderService({
  ctx,
  trusted,
  passes,
}: {
  ctx: Context;
  trusted: boolean;
  passes: Set<RenderPass>;
}): RenderService {
  const purifier = createDOMPurify(window);
  const sanitize = (html: string) =>
    purifier.sanitize(html, sanitizerOptions(trusted));
  return {
    trusted,
    async into(container, source, context = {}) {
      const pass = createRenderPass({ container, source, context, passes });
      container.classList.add("markdown-rendered");
      if (context.documentUri) {
        container.dataset.noteSource = context.documentUri;
      }
      await ctx.serial("render/preProcess", pass);
      if (context.signal?.aborted) {
        await pass.dispose();
        return pass;
      }
      container.innerHTML = ctx.markdown.renderer.renderMarkdown(
        pass.displaySource ?? source,
        { sanitize, strictLineBreaks: ctx.editor.settings.strictLineBreaks },
      );
      constrainRemoteContent(container, trusted);
      renderFences(ctx, pass);
      if (context.signal?.aborted) {
        await pass.dispose();
        return pass;
      }
      await ctx.serial("render/postProcess", pass);
      pass.measure();
      return pass;
    },
  };
}

function renderFences(ctx: Context, pass: RenderPass): void {
  for (const element of pass.container.querySelectorAll<HTMLElement>(
    "[data-fence]",
  )) {
    ctx.bail(
      "render/fence",
      {
        language: element.dataset.fence ?? "",
        source: decodeURIComponent(element.dataset.source ?? ""),
        element,
      },
      pass,
    );
  }
}
