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
  provides: ["render"],
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

type MaybeSyncPromise = Promise<void> & { readonly sync?: true };

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
    into(container, source, context = {}) {
      const pass = createRenderPass({ container, source, context, passes });
      container.classList.add("markdown-rendered");
      if (context.documentUri) {
        container.dataset.noteSource = context.documentUri;
      }
      return executeRenderPass({ ctx, trusted, sanitize, pass, context });
    },
  };
}

function executeRenderPass({
  ctx,
  trusted,
  sanitize,
  pass,
  context,
}: {
  ctx: Context;
  trusted: boolean;
  sanitize: (html: string) => string;
  pass: RenderPass;
  context: NonNullable<Parameters<RenderService["into"]>[2]>;
}): Promise<RenderPass> {
  const { container, source } = pass;
  const finishPostProcess = (): Promise<RenderPass> => {
    if (context.signal?.aborted) {
      return pass.dispose().then(() => pass);
    }
    const post = ctx.serial("render/postProcess", pass) as MaybeSyncPromise;
    if (post.sync) {
      renderFences(ctx, pass);
      pass.measure();
      return Promise.resolve(pass);
    }
    return post.then(() => {
      if (!context.signal?.aborted) {
        renderFences(ctx, pass);
      }
      pass.measure();
      return pass;
    });
  };
  const finishBody = (): Promise<RenderPass> => {
    if (context.signal?.aborted) {
      return pass.dispose().then(() => pass);
    }
    container.innerHTML = ctx.markdown.renderer.renderMarkdown(
      pass.displaySource ?? source,
      { sanitize, strictLineBreaks: ctx.editor.settings.strictLineBreaks },
    );
    constrainRemoteContent(container, trusted);
    return finishPostProcess();
  };
  try {
    const pre = ctx.serial("render/preProcess", pass) as MaybeSyncPromise;
    return pre.sync ? finishBody() : pre.then(finishBody);
  } catch (error) {
    return Promise.reject(error);
  }
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
