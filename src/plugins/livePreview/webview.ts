import { bindCaller } from "../../kernel";
import type { CallerBound } from "../../kernel";
import type { LivePreview } from "./api";
import { renderedPosition } from "./rendered-position";
import { Compartment } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import type { Plugin } from "../../kernel";
import type {} from "../editor/api";
import type {} from "../commands/api";
import type {} from "./api";
import { blockRenderers, inlineRenderers } from "./registry";
import {
  blockIndex,
  blockDecorations,
  renderRevision,
  refreshRender,
} from "./blocks";
import { documentTree } from "./document-tree";
import { hybridInline } from "./inline";
import type {} from "../render/api";
import { MarkdownBlock } from "../../webview/ui/markdown-widget";
import { escapeBlock, verticalBlock, moveTo } from "./motion";
export const livePreviewWebview: Plugin<{ mode: "source" | "livePreview" }> = {
  name: "livePreview",
  inject: { required: ["editor", "commands", "render"] },
  apply(ctx, config) {
    const view = ctx.editor.view;
    const compartment = new Compartment();
    let mode = ctx.editor.mode ?? config.mode;
    const extension = [
      documentTree,
      renderRevision,
      hybridInline,
      blockIndex,
      blockDecorations((error) =>
        ctx.logger.error("Block renderer failed", error),
      ),
      keymap.of([
        { key: "Escape", run: moveTo(escapeBlock) },
        { key: "ArrowDown", run: moveTo((state) => verticalBlock(state, 1)) },
        { key: "ArrowUp", run: moveTo((state) => verticalBlock(state, -1)) },
      ]),
    ];
    ctx.effect(() =>
      ctx.editor.extend(compartment.of(mode === "source" ? [] : extension)),
    );
    const service: LivePreview & CallerBound<LivePreview> = {
      [bindCaller](caller) {
        const owner = caller.fiber!.definition.name;
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
    ctx.provide("livePreview", service);
    ctx.on("render/changed", () =>
      view.dispatch({ effects: refreshRender.of(null) }),
    );
    ctx.on("editor/modeRestored", (next) => service.setMode(next));
    for (const kind of [
      "HorizontalRule",
      "HTMLBlock",
      "CodeBlock",
      "FencedCode",
    ]) {
      ctx.effect(() =>
        ctx.editor.extend(
          blockRenderers.of({
            kind,
            editing: "reveal",
            match: (node) => node.name === kind,
            widget: (block) => new MarkdownBlock(block, ctx.render),
          }),
          { slot: "base" },
        ),
      );
    }
    ctx.effect(() =>
      ctx.commands.register("editor:toggle-source", () => {
        service.setMode(mode === "source" ? "livePreview" : "source");
        return true;
      }),
    );
  },
};
