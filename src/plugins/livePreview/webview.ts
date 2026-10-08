import { Compartment } from "@codemirror/state";
import { WidgetType, keymap } from "@codemirror/view";
import type { Plugin } from "../../kernel";
import type {} from "../editor/api";
import type {} from "../commands/api";
import type {} from "./api";
import { blockRenderers, inlineRenderers } from "./registry";
import { blockIndex, blockDecorations } from "./blocks";
import { documentTree } from "./document-tree";
import { hybridInline } from "./inline";
class Rule extends WidgetType {
  override toDOM() {
    return document.createElement("hr");
  }
}
export const livePreviewWebview: Plugin<{ mode: "source" | "livePreview" }> = {
  name: "livePreview",
  inject: { required: ["editor", "commands"] },
  apply(ctx, config) {
    const view = ctx.editor.view,
      compartment = new Compartment();
    let mode = ctx.editor.mode ?? config.mode;
    const extension = [
      documentTree,
      hybridInline,
      blockIndex,
      blockDecorations((error) => ctx.logger.error("Block renderer failed", error)),
      keymap.of([
        {
          key: "Escape",
          run(view) {
            const head = view.state.selection.main.head,
              block = view.state.field(blockIndex).find((b) => b.from <= head && head <= b.to);
            if (!block) return false;
            const at = Math.min(view.state.doc.length, block.to + 1);
            view.dispatch({ selection: { anchor: at }, scrollIntoView: true });
            return true;
          },
        },
      ]),
    ];
    ctx.effect(() => ctx.editor.extend(compartment.of(mode === "source" ? [] : extension)));
    const service = {
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
        view.dispatch({ effects: compartment.reconfigure(mode === "source" ? [] : extension) });
      },
    };
    ctx.provide("livePreview", service);
    ctx.on("editor/modeRestored", (next) => service.setMode(next));
    ctx.effect(() =>
      service.block({
        kind: "rule",
        editing: "reveal",
        match: (node) => node.name === "HorizontalRule",
        widget: () => new Rule(),
      }),
    );
    ctx.effect(() =>
      ctx.commands.register("editor:toggle-source", () => {
        service.setMode(mode === "source" ? "livePreview" : "source");
        return true;
      }),
    );
  },
};
