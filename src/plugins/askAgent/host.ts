import type { Context, Disposer, Plugin } from "../../kernel";
import type {} from "../document/api";
import { AskAgent } from "./agent";
import { protocol } from "./protocol";
export const askAgentHost: Plugin = {
  name: "askAgent",
  inject: { required: ["editors", "selections", "workbench"] },
  apply(ctx) {
    const agent = new AskAgent({
      editors: ctx.editors,
      selections: ctx.selections,
      workbench: ctx.workbench,
      beforeSave: (panel) => ctx.serial("document/willSave", panel.session),
    });
    ctx.effect(() => () => agent.dispose());
    registerPanelHandlers(ctx, agent);
  },
};
function registerPanelHandlers(ctx: Context, agent: AskAgent): void {
  const handlers = new Map<string, Disposer>();
  const refresh = () => {
    const panels = ctx.editors.all();
    for (const [id, stop] of handlers) {
      const panel = panels.find((item) => item.id === id);
      const config = panel && ctx.workbench.config(panel.document);
      if (
        !config ||
        config.preset !== "obsidian" ||
        config.features?.askAgent?.enabled === false
      ) {
        void stop();
        handlers.delete(id);
      }
    }
    for (const panel of panels) {
      const config = ctx.workbench.config(panel.document);
      if (
        handlers.has(panel.id) ||
        config.preset !== "obsidian" ||
        config.features?.askAgent?.enabled === false
      ) {
        continue;
      }
      const ask = panel.rpc.handle(protocol, "ask", (_request, token) =>
        agent.ask(panel.id, token),
      );
      handlers.set(panel.id, () => {
        void ask();
      });
    }
  };
  ctx.on("editor/opened", refresh);
  ctx.on("editor/closed", refresh);
  if (ctx.workbench.onConfiguration) {
    ctx.effect(() => ctx.workbench.onConfiguration!(refresh));
  }
  ctx.effect(() => () => {
    for (const stop of handlers.values()) {
      void stop();
    }
    handlers.clear();
  });
  refresh();
}
