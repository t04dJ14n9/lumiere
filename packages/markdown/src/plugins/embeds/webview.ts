import type { Context, Plugin } from "@workshop/core";
import type {} from "../editor/api";
import type {} from "../commands/api";
import type {} from "../livePreview/api";
import type {} from "../resources/api";
import type {} from "../render/api";
import { MarkdownBlock } from "../../webview/ui/markdown-widget";
import { embedEstimatedHeight } from "./estimated-height";
import type { RenderBlock } from "../livePreview/api";
import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";
import { MarkdownInline } from "../../webview/ui/inline-widget";
import { protocol as links } from "../links/protocol";
import { enhanceEmbeds } from "./post-process";
import { embedEditing, embedsImage, inlineEmbedClick } from "./clicks";
import { editingImageAt, imageSelection } from "./image-selection";
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
    ctx.effect(() => ctx.editor.extend(imageSelection()));
    registerEmbedContent(ctx, cleanups);
    registerInsertion(ctx);
  },
};

/** The embed a paragraph holds alone, as its source, if it does. */
function soleEmbed(
  node: SyntaxNodeRef,
  state: EditorState,
): string | undefined {
  if (node.name !== "Paragraph") {
    return undefined;
  }
  const first = node.node.firstChild;
  return first &&
    ["WikiEmbed", "Image"].includes(first.name) &&
    state.sliceDoc(node.from, first.from).trim() === "" &&
    state.sliceDoc(first.to, node.to).trim() === ""
    ? state.sliceDoc(first.from, first.to)
    : undefined;
}

/** MarkdownBlock with a height reserve so off-viewport remounts stay tall. */
class EmbedBlock extends MarkdownBlock {
  override get estimatedHeight(): number {
    return embedEstimatedHeight(this.block.source);
  }
}

function registerEmbedRenderers(ctx: Context): void {
  const widget = (block: RenderBlock) =>
    new EmbedBlock(block, ctx.render, embedEditing(block.source));
  ctx.effect(() =>
    ctx.livePreview.block({
      kind: "embed",
      nodes: ["Paragraph"],
      editing: "reveal",
      match(node, state) {
        const source = soleEmbed(node, state);
        return source !== undefined && !embedsImage(source);
      },
      widget,
    }),
  );
  // An image stays rendered whatever the caret does, as in Obsidian 1.13,
  // until Enter or Tab opens its source for editing.
  ctx.effect(() =>
    ctx.livePreview.block({
      kind: "embed",
      nodes: ["Paragraph"],
      editing: "widget",
      match(node, state) {
        const source = soleEmbed(node, state);
        return source !== undefined && embedsImage(source);
      },
      showSource: (state, block) => editingImageAt(state, block),
      widget,
    }),
  );
  ctx.effect(() =>
    ctx.livePreview.inline({
      nodes: ["WikiEmbed", "Image"],
      decorate(node, cx) {
        const source = cx.state.sliceDoc(node.from, node.to);
        const shown = embedsImage(source)
          ? editingImageAt(cx.state, node)
          : cx.revealed(node.from, node.to);
        if (!shown) {
          cx.replace(
            node.from,
            node.to,
            new EmbedInline(source, ctx.render, inlineEmbedClick(source)),
          );
        }
      },
    }),
  );
}

/**
 * Inline image/note/media embeds share MarkdownInline rendering but need the
 * same height reserve as EmbedBlock: a `|WxH` image mid-paragraph is still
 * hundreds of pixels tall, and an off-viewport decoration rebuild collapses
 * the line to ~24px without estimatedHeight.
 */
class EmbedInline extends MarkdownInline {
  /**
   * Missing `|WxH` images paint as short unresolved text (~100px). Without a
   * min-height, lineBlockAt stays short even though estimatedHeight is 640+,
   * and off-viewport remounts keep that measured height in the map.
   */
  override toDOM(view: EditorView): HTMLElement {
    const dom = super.toDOM(view);
    const reserve = embedEstimatedHeight(this.source);
    if (reserve > 0) {
      dom.style.minHeight = `${reserve}px`;
    }
    return dom;
  }
  override get estimatedHeight(): number {
    return embedEstimatedHeight(this.source);
  }
}

function registerEmbedContent(ctx: Context, cleanups: Set<() => void>): void {
  ctx.on("render/postProcess", (pass) => {
    const stop = enhanceEmbeds({
      pass,
      render: ctx.render,
      resources: ctx.resources,
      open: (target, wiki) => {
        void ctx.rpc
          .call(links, "open", {
            href: target,
            wiki,
            side: false,
            ...(pass.documentUri === undefined
              ? {}
              : { source: pass.documentUri }),
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
        // As in Obsidian: the caret after the text.
        selection: { anchor: to + 3 },
        userEvent: "input.embed",
      });
      return true;
    }),
  );
}
