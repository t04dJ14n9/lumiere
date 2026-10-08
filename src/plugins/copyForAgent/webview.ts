import { EditorView, ViewPlugin } from "@codemirror/view";
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
    ctx.effect(() => ctx.commands.register("copyForAgent", copy));
    ctx.on("editor/selectionMenu", (items) => [
      ...items,
      { label: "Copy for Agent", run: trigger },
    ]);
    registerCopyKeys(ctx, trigger);
    registerSelectionMenu(ctx);
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
function registerSelectionMenu(ctx: Context): void {
  let live = true;
  let stop: (() => void | Promise<void>) | undefined;
  ctx.effect(() => () => {
    live = false;
    void stop?.();
  });
  ctx.effect(() =>
    ctx.editor.extend(
      EditorView.domEventHandlers({
        contextmenu(event) {
          const range =
            ctx.bail("editor/projectSelection") ??
            ctx.editor.view.state.selection.main;
          if (range.from === range.to) {
            return false;
          }
          event.preventDefault();
          void ctx.waterfall("editor/selectionMenu", []).then((items) => {
            if (live) {
              void stop?.();
              stop = ctx.menu.open(ctx.editor.view.dom, items, {
                x: event.clientX,
                y: event.clientY,
              });
            }
          });
          return true;
        },
      }),
    ),
  );
}
