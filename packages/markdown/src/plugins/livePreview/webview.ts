import { bindCaller } from "@workshop/core";
import type { CallerBound, Context, Plugin } from "@workshop/core";
import { pointerSelectionTracking } from "../../webview/ui/pointer-selection";
import { fenceGuardSelectionSupport } from "../../webview/ui/fence-click-guard";
import type { LivePreview } from "./api";
import { clickPositionSync } from "./click-position";
import { ruleClick } from "./rule-click";
import { renderedPosition } from "./rendered-position";
import { Compartment } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import type {} from "../editor/api";
import type {} from "../commands/api";
import type {} from "./api";
import { blockRenderers, inlineRenderers } from "./registry";
import {
  blockIndex,
  visiblePosition,
  renderRevision,
  refreshRender,
} from "./blocks";
import { blockDecorations, blockViewportSupport } from "./viewport-decorations";
import { documentTree, documentTreeCompleter } from "./document-tree";
import { frontmatterPlaceholderRenderer } from "./frontmatter-placeholder";
import { hybridInline } from "./inline";
import type {} from "../render/api";
import {
  evictMarkdownBlockDomPool,
  MarkdownBlock,
} from "../../webview/ui/markdown-widget";
import { markdownBlockWidthTracker } from "../../webview/ui/markdown-block-height";
import {
  escapeBlock,
  verticalBlock,
  moveTo,
  renderedWidgets,
  foldedRanges,
} from "./motion";
import { sourceVisibleAt } from "./source-visibility";
export const livePreviewWebview: Plugin<{ mode: "source" | "livePreview" }> = {
  name: "livePreview",
  inject: { required: ["editor", "commands", "render"] },
  provides: ["livePreview"],
  apply(ctx, config) {
    const service = registerEngine(ctx, config.mode);
    ctx.provide("livePreview", service);
    registerRenderInvalidation(ctx, service);
    registerFallbackBlocks(ctx);
    registerModeCommand(ctx, service);
  },
};

function registerEngine(
  ctx: Context,
  initialMode: "source" | "livePreview",
): LivePreview {
  const view = ctx.editor.view;
  const compartment = new Compartment();
  let mode = ctx.editor.mode ?? initialMode;
  const extension = engineExtensions(ctx);
  ctx.effect(() =>
    ctx.editor.extend(compartment.of(mode === "source" ? [] : extension)),
  );
  const service: LivePreview & CallerBound<LivePreview> = {
    [bindCaller](caller) {
      const owner = caller.owner;
      return {
        ...service,
        get mode() {
          return service.mode;
        },
        block: (renderer) =>
          ctx.editor.extend(blockRenderers.of(renderer), { owner }),
        inline: (renderer) =>
          ctx.editor.extend(inlineRenderers.of(renderer), { owner }),
      };
    },
    inlineExtensions: () => [documentTree, hybridInline],
    position: renderedPosition,
    visiblePosition,
    verticalPosition: verticalBlock,
    renderedWidgets,
    foldedRanges,
    sourceVisibleAt,
    block(renderer: Parameters<typeof blockRenderers.of>[0]) {
      return ctx.editor.extend(blockRenderers.of(renderer));
    },
    inline(renderer: Parameters<typeof inlineRenderers.of>[0]) {
      return ctx.editor.extend(inlineRenderers.of(renderer));
    },
    get mode() {
      return mode;
    },
    setMode(next: "source" | "livePreview") {
      mode = next;
      ctx.editor.mode = next;
      view.dispatch({
        effects: compartment.reconfigure(mode === "source" ? [] : extension),
      });
    },
  };
  return service;
}

function registerRenderInvalidation(ctx: Context, service: LivePreview): void {
  const view = ctx.editor.view;
  ctx.on("render/changed", () => {
    evictMarkdownBlockDomPool(ctx.render);
    const effect = refreshRender.of(null);
    if (!ctx.editor.dispatchEffect?.(effect)) {
      view.dispatch({ effects: effect });
    }
  });
  ctx.on("editor/modeRestored", (next) => service.setMode(next));
}

function registerFallbackBlocks(ctx: Context): void {
  // Code blocks and thematic breaks are decorated source lines instead
  // (code-lines.ts, inline.ts), so revealing them never moves the text.
  ctx.effect(() =>
    ctx.editor.extend(
      blockRenderers.of({
        kind: "HTMLBlock",
        nodes: ["HTMLBlock"],
        editing: "reveal",
        match: (node) => node.name === "HTMLBlock",
        // Replace whole lines, including up to three spaces of indentation.
        range: (node, state) => ({
          from: state.doc.lineAt(node.from).from,
          to: node.to,
        }),
        widget: (block) => new MarkdownBlock(block, ctx.render),
      }),
      { slot: "base" },
    ),
  );
  // Collapse a complete YAML fence before Properties chrome configures so
  // heading/body can enter the viewport from core Live Preview (wave 12).
  ctx.effect(() =>
    ctx.editor.extend(blockRenderers.of(frontmatterPlaceholderRenderer()), {
      slot: "base",
    }),
  );
}

function registerModeCommand(ctx: Context, service: LivePreview): void {
  ctx.effect(() =>
    ctx.commands.register("editor:toggle-source", () => {
      service.setMode(service.mode === "source" ? "livePreview" : "source");
      return true;
    }),
  );
}

function engineExtensions(ctx: Context) {
  return [
    documentTree,
    documentTreeCompleter,
    markdownBlockWidthTracker,
    renderRevision,
    pointerSelectionTracking,
    fenceGuardSelectionSupport,
    clickPositionSync,
    ruleClick,
    hybridInline,
    blockIndex,
    ...blockViewportSupport,
    blockDecorations((error) =>
      ctx.logger.error("Block renderer failed", error),
    ),
    keymap.of([
      { key: "Escape", run: moveTo(escapeBlock) },
      { key: "ArrowDown", run: moveTo((state) => verticalBlock(state, 1)) },
      { key: "ArrowUp", run: moveTo((state) => verticalBlock(state, -1)) },
    ]),
  ];
}
