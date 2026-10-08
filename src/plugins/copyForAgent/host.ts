import type { Context, Disposer, Plugin } from "../../kernel";
import type {} from "./api";
import type {} from "../document/api";
import { AgentReferences } from "./agent";
import { protocol } from "./protocol";
export const copyForAgentHost: Plugin = {
  name: "copyForAgent",
  inject: { required: ["editors", "selections", "workbench"] },
  apply(ctx) {
    const agent = new AgentReferences({
      editors: ctx.editors,
      selections: ctx.selections,
      workbench: ctx.workbench,
      beforeSave: (panel) => ctx.serial("document/willSave", panel.session),
    });
    ctx.provide("agent", agent);
    ctx.effect(() => () => agent.dispose());
    registerPanelHandlers(ctx, agent);
  },
};
function registerPanelHandlers(ctx: Context, agent: AgentReferences): void {
  const handlers = new Map<string, Disposer>();
  const refresh = () => {
    const panels = ctx.editors.all();
    for (const [id, stop] of handlers) {
      const panel = panels.find((item) => item.id === id);
      const config = panel && ctx.workbench.config(panel.document);
      if (
        !config ||
        config.preset !== "obsidian" ||
        config.features?.copyForAgent?.enabled === false
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
        config.features?.copyForAgent?.enabled === false
      ) {
        continue;
      }
      handlers.set(
        panel.id,
        panel.rpc.handle(protocol, "copy", (_request, token) =>
          agent.copy(panel.id, { interactive: true, token }),
        ),
      );
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
