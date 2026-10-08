import createDOMPurify from "dompurify";
import type { Disposer, Plugin } from "../../kernel";
import type {} from "../dialect/api";
import type { RenderPass } from "./api";
export const renderWebview: Plugin<{ trusted: boolean }> = {
  name: "render",
  inject: { required: ["markdown"] },
  apply(ctx, config) {
    const purifier = createDOMPurify(window);
    const passes = new Set<RenderPass>();
    ctx.effect(() => async () => {
      for (const pass of passes) {
        await pass.dispose();
      }
    });
    ctx.provide("render", {
      trusted: config.trusted,
      async into(container, source, context = {}) {
        const disposers: Disposer[] = [];
        let live = true;
        const pass: RenderPass = {
          source,
          documentUri: context.documentUri,
          documentText: context.documentText,
          taskLineCount: context.taskLineCount,
          container,
          sourceLine: context.sourceLine ?? 0,
          ancestry: context.ancestry ?? [],
          renderKey: source,
          measure: context.measure ?? (() => {}),
          onDispose(dispose) {
            if (!live) {
              void dispose();
            } else {
              disposers.push(dispose);
            }
          },
          async dispose() {
            if (!live) {
              return;
            }
            live = false;
            passes.delete(pass);
            for (const dispose of disposers.reverse()) {
              await dispose();
            }
          },
        };
        passes.add(pass);
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
          {
            sanitize: (html) =>
              purifier.sanitize(html, {
                ADD_TAGS: config.trusted ? ["iframe"] : [],
                FORBID_TAGS: ["script", "style", "form", "object", "embed"],
                FORBID_ATTR: ["srcdoc"],
              }),
          },
        );
        for (const frame of container.querySelectorAll("iframe")) {
          if (
            !config.trusted ||
            !/^https:\/\//i.test(frame.getAttribute("src") ?? "")
          ) {
            frame.remove();
          } else {
            frame.setAttribute(
              "sandbox",
              "allow-scripts allow-same-origin allow-presentation",
            );
            frame.loading = "lazy";
          }
        }
        if (!config.trusted) {
          for (const media of container.querySelectorAll("[src]")) {
            if (/^https?:/i.test(media.getAttribute("src") ?? "")) {
              media.removeAttribute("src");
            }
          }
        }
        for (const element of container.querySelectorAll<HTMLElement>(
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
        if (context.signal?.aborted) {
          await pass.dispose();
          return pass;
        }
        await ctx.serial("render/postProcess", pass);
        pass.measure();
        return pass;
      },
    });
  },
};
