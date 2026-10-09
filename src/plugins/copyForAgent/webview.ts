import { ViewPlugin } from "@codemirror/view";
import type { Context, Plugin } from "../../kernel";
import type {} from "../commands/api";
import type {} from "../editor/api";
import type {} from "../document/api";
import { protocol } from "./protocol";
export const copyForAgentWebview: Plugin = {
  name: "copyForAgent",
  inject: { required: ["editor", "commands", "document", "rpc", "menu"] },
  apply(ctx) {
    const copy = async () => {
      await ctx.document.flush();
      return ctx.rpc.call(protocol, "copy", {});
    };
    const trigger = () => {
      void copy().catch((error) =>
        ctx.logger.warn("Copy for Agent failed", error),
      );
    };
    const ask = async () => {
      await ctx.document.flush();
      return ctx.rpc.call(protocol, "ask", {});
    };
    const askNow = () => {
      void ask().catch((error) =>
        ctx.logger.warn("Ask Agent about Selection failed", error),
      );
    };
    ctx.effect(() => ctx.commands.register("copyForAgent", copy));
    ctx.effect(() => ctx.commands.register("askAgentAboutSelection", ask));
    ctx.on("editor/selectionMenu", (items) => [
      ...items,
      { label: "Ask Agent about Selection", run: askNow },
      { label: "Copy for Agent", run: trigger },
    ]);
    registerCopyKeys(ctx, trigger);
  },
};
function registerCopyKeys(ctx: Context, trigger: () => void): void {
  // Capture also reaches focused table cells and grid selections, whose views own their keys.
  ctx.effect(() =>
    ctx.editor.extend(
      ViewPlugin.define((view) => {
        const events = new AbortController();
        view.dom.addEventListener(
          "keydown",
          (event) => {
            if (
              !(event.metaKey || event.ctrlKey) ||
              !event.altKey ||
              event.shiftKey ||
              event.key.toLowerCase() !== "c"
            ) {
              return;
            }
            if (
              event.target instanceof Element &&
              event.target.closest("input, textarea")
            ) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            trigger();
          },
          { capture: true, signal: events.signal },
        );
        return { destroy: () => events.abort() };
      }),
    ),
  );
}
