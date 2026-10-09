import type { Context, Disposer, Plugin } from "../../kernel";
import type {} from "../document/api";
import { AgentHandoff } from "./agent";
import { protocol } from "./protocol";
export const agentBridgeHost: Plugin = {
  name: "agentBridge",
  inject: { required: ["editors", "selections", "workbench"] },
  apply(ctx) {
    const agent = new AgentHandoff({
      editors: ctx.editors,
      selections: ctx.selections,
      workbench: ctx.workbench,
      beforeSave: (panel) => ctx.serial("document/willSave", panel.session),
    });
    ctx.effect(() => () => agent.dispose());
    registerPanelHandlers(ctx, agent);
  },
};
function registerPanelHandlers(ctx: Context, agent: AgentHandoff): void {
  const handlers = new Map<string, Disposer>();
  const refresh = () => {
    const panels = ctx.editors.all();
    for (const [id, stop] of handlers) {
      const panel = panels.find((item) => item.id === id);
      const config = panel && ctx.workbench.config(panel.document);
      if (
        !config ||
        config.preset !== "obsidian" ||
        config.features?.agentBridge?.enabled === false
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
        config.features?.agentBridge?.enabled === false
      ) {
        continue;
      }
      const copy = panel.rpc.handle(protocol, "copy", (_request, token) =>
        agent.copy(panel.id, token),
      );
      handlers.set(panel.id, () => {
        void copy();
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
