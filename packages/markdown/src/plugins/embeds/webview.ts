import type { Context, Plugin } from "@workshop/core";
import type {} from "../editor/api";
import type {} from "../commands/api";
import type {} from "../livePreview/api";
import type {} from "../resources/api";
import type {} from "../render/api";
import { MarkdownBlock } from "../../webview/ui/markdown-widget";
import {
  embedEstimatedHeight,
  rememberNoteEmbedHeight,
} from "./estimated-height";
import type { RenderBlock } from "../livePreview/api";
import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";
import { MarkdownInline } from "../../webview/ui/inline-widget";
import { protocol as links } from "../links/protocol";
import { enhanceEmbeds, type PassEmbeds } from "./post-process";
import { forgetEmbedResources } from "./resource-cache";
import {
  embedEditing,
  embedsImage,
  embedsNote,
  inlineEmbedClick,
} from "./clicks";
import { editingImageAt, imageSelection } from "./image-selection";
import { writtenHeight } from "./image-size";
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

/** Observe note-embed growth so remounts keep the painted height. */
const noteObservers = new WeakMap<HTMLElement, ResizeObserver>();

function watchNoteEmbed(dom: HTMLElement, source: string): void {
  if (!embedsNote(source) || noteObservers.has(dom)) {
    return;
  }
  const observer = new ResizeObserver((entries) => {
    const height = entries[0]?.contentRect.height ?? 0;
    if (height > 0) {
      rememberNoteEmbedHeight(source, height);
    }
  });
  observer.observe(dom);
  noteObservers.set(dom, observer);
}

/** The observer has the last height; reading it here forced a layout per unmount. */
function unwatchNoteEmbed(dom: HTMLElement): void {
  noteObservers.get(dom)?.disconnect();
  noteObservers.delete(dom);
}

/** MarkdownBlock with a height reserve so off-viewport remounts stay tall. */
class EmbedBlock extends MarkdownBlock {
  override toDOM(view: EditorView): HTMLElement {
    const dom = super.toDOM(view);
    watchNoteEmbed(dom, this.block.source);
    return dom;
  }
  override destroy(dom: HTMLElement): void {
    unwatchNoteEmbed(dom);
    super.destroy(dom);
  }
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
      // Viewport-only decorations drop the widget off-screen; estimatedHeight
      // then never lands in the line map (mid-paragraph `|WxH` → ~one line).
      persistent: true,
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
 *
 * `toDOM` also applies minHeight so the first in-viewport measure does not
 * overwrite the reserve with a short unresolved placeholder (~one line).
 */
class EmbedInline extends MarkdownInline {
  override get estimatedHeight(): number {
    return embedEstimatedHeight(this.source);
  }
  /**
   * Explicit `|WxH` missing images paint as short unresolved text. A bare
   * `span` ignores min-height; `inline-block` makes the reserve paint. Only
   * apply when `|WxH` is written — unsized images (selection-inline) must
   * stay in normal inline flow so drag geometry hits line start. Persistent
   * decorations keep estimatedHeight off-viewport for remounts.
   * Note embeds also watch painted height for the measured cache (#125).
   */
  override toDOM(view: EditorView): HTMLElement {
    const node = super.toDOM(view);
    if (writtenHeight(this.source) !== undefined) {
      const height = this.estimatedHeight;
      if (height > 0) {
        node.style.minHeight = `${height}px`;
        node.style.display = "inline-block";
        node.style.verticalAlign = "text-top";
      }
    }
    watchNoteEmbed(node, this.source);
    return node;
  }
  override destroy(dom: HTMLElement): void {
    unwatchNoteEmbed(dom);
    super.destroy(dom);
  }
}

function registerEmbedContent(ctx: Context, cleanups: Set<() => void>): void {
  const passes = new Set<PassEmbeds>();
  ctx.on("resources/changed", () => forgetEmbedResources(ctx.resources));
  // Every pass, nested note embeds included: inline embeds keep their DOM
  // when the page renders again, so `render/changed` would not reach them.
  ctx.on("resources/found", () => {
    for (const embeds of [...passes]) {
      embeds.retryMissing();
    }
  });
  ctx.on("render/postProcess", (pass) => {
    if (
      pass.container.querySelectorAll<HTMLElement>("[data-resource]").length ===
      0
    ) {
      return;
    }
    const embeds = enhanceEmbeds({
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
    passes.add(embeds);
    const cleanup = () => {
      embeds.dispose();
      passes.delete(embeds);
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
