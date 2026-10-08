import type { Plugin } from "../../kernel";
import type {} from "../editor/api";
import type {} from "../commands/api";
import type {} from "../livePreview/api";
import type {} from "../resources/api";
import type {} from "../render/api";
import { MarkdownBlock } from "../../webview/ui/markdown-widget";
import { MarkdownInline } from "../../webview/ui/inline-widget";
import { imageStyles } from "./styles";
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
      for (const cleanup of cleanups) cleanup();
      cleanups.clear();
    });
    ctx.effect(() => ctx.editor.extend(imageStyles));
    ctx.effect(() =>
      ctx.livePreview.block({
        kind: "embed",
        editing: "reveal",
        match(node, state) {
          if (node.name !== "Paragraph") return false;
          const first = node.node.firstChild;
          return Boolean(
            first &&
              ["WikiEmbed", "Image"].includes(first.name) &&
              state.sliceDoc(node.from, first.from).trim() === "" &&
              state.sliceDoc(first.to, node.to).trim() === "",
          );
        },
        widget: (block) => new MarkdownBlock(block, ctx.render),
      }),
    );
    ctx.effect(() =>
      ctx.livePreview.inline({
        nodes: ["WikiEmbed", "Image"],
        decorate(node, cx) {
          if (!cx.revealed(node.from, node.to))
            cx.replace(
              node.from,
              node.to,
              new MarkdownInline(
                cx.state.sliceDoc(node.from, node.to),
                ctx.render,
              ),
            );
        },
      }),
    );
    ctx.on("render/postProcess", (pass) => {
      const stop = enhanceEmbeds(ctx, pass);
      const cleanup = () => {
        stop();
        cleanups.delete(cleanup);
      };
      cleanups.add(cleanup);
      pass.onDispose(cleanup);
    });
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
  },
};
