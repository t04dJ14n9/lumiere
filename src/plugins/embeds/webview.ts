import type { Context, Plugin } from "../../kernel";
import type {} from "../editor/api";
import type {} from "../commands/api";
import type {} from "../livePreview/api";
import type {} from "../resources/api";
import type {} from "../render/api";
import { MarkdownBlock } from "../../webview/ui/markdown-widget";
import { MarkdownInline } from "../../webview/ui/inline-widget";
import { protocol as links } from "../links/protocol";
import { enhanceEmbeds } from "./post-process";
export const embedsWebview: Plugin = {
  name: "embeds",
  inject: {
    required: [
      "editor",
      "commands",
      "livePreview",
      "render",
      "resources",
      "rpc",
    ],
  },
  apply(ctx) {
    const cleanups = new Set<() => void>();
    ctx.effect(() => () => {
      for (const cleanup of cleanups) {
        cleanup();
      }
      cleanups.clear();
    });
    registerEmbedRenderers(ctx);
    registerEmbedContent(ctx, cleanups);
    registerInsertion(ctx);
  },
};

function registerEmbedRenderers(ctx: Context): void {
  ctx.effect(() =>
    ctx.livePreview.block({
      kind: "embed",
      editing: "reveal",
      match(node, state) {
        if (node.name !== "Paragraph") {
          return false;
        }
        const first = node.node.firstChild;
        return Boolean(
          first &&
            ["WikiEmbed", "Image"].includes(first.name) &&
            state.sliceDoc(node.from, first.from).trim() === "" &&
            state.sliceDoc(first.to, node.to).trim() === "",
        );
      },
      // Embedded notes keep clicks for their content, as in Obsidian.
      widget: (block) => new MarkdownBlock(block, ctx.render, false),
    }),
  );
  ctx.effect(() =>
    ctx.livePreview.inline({
      nodes: ["WikiEmbed", "Image"],
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
}

function registerEmbedContent(ctx: Context, cleanups: Set<() => void>): void {
  ctx.on("render/postProcess", (pass) => {
    const stop = enhanceEmbeds({
      pass,
      render: ctx.render,
      resources: ctx.resources,
      open: (target) => {
        void ctx.rpc
          .call(links, "open", {
            href: target,
            wiki: true,
            side: false,
            source: pass.documentUri,
          })
          .catch((error) => ctx.logger.warn("Open embed failed", error));
      },
    });
    const cleanup = () => {
      stop();
      cleanups.delete(cleanup);
    };
    cleanups.add(cleanup);
    pass.onDispose(cleanup);
  });
}

function registerInsertion(ctx: Context): void {
  ctx.effect(() =>
    ctx.commands.register("editor:insert-embed", () => {
      const view = ctx.editor.view;
      const { from, to } = view.state.selection.main;
      view.dispatch({
        changes: {
          from,
          to,
          insert: `![[${view.state.sliceDoc(from, to)}]]`,
        },
        selection: { anchor: from + 3, head: to + 3 },
        userEvent: "input.embed",
      });
      return true;
    }),
  );
}
