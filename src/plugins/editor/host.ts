import type { Manifest } from "../../shared/manifest";
import { captureView, restoreView } from "./view-transfer";
import type { PanelShell } from "../../shared/runtime";
import type { Context, Plugin } from "../../kernel";
import type {} from "../document/api";
import type { EditorPanel } from "./api";
import { createPanel } from "./panel";
export const editorHost: Plugin<{
  features?: readonly Manifest[];
  configure: (context: Context, panel: PanelShell) => void;
}> = {
  name: "editor",
  inject: { required: ["workbench", "documents"] },
  apply(ctx, config) {
    const panels = new Map<string, EditorPanel>();
    const active = () => [...panels.values()].find((panel) => panel.active());
    const contexts = () => {
      const panel = active();
      const settings = panel ? ctx.workbench.config(panel.document) : undefined;
      for (const manifest of config.features ?? []) {
        void ctx.workbench.execute(
          "setContext",
          `markdownWorkbench.plugin.${manifest.id}`,
          Boolean(
            panel &&
              settings?.preset === "obsidian" &&
              (settings.features?.[manifest.id]?.enabled ??
                manifest.defaultEnabled),
          ),
        );
      }
      for (const id of ["editor", "commands", "livePreview"])
        void ctx.workbench.execute(
          "setContext",
          `markdownWorkbench.plugin.${id}`,
          Boolean(active()),
        );
    };
    if (ctx.workbench.onConfiguration)
      ctx.effect(() => ctx.workbench.onConfiguration!(contexts));
    ctx.on("editor/activeChanged", contexts);
    ctx.on("editor/opened", contexts);
    ctx.on("editor/closed", contexts);
    ctx.provide("editors", {
      all: () => [...panels.values()],
      active,
      async capture(id) {
        const panel = panels.get(id);
        if (!panel) throw new Error("Editor not found");
        return captureView(panel);
      },
      async restore(id, snapshot) {
        const panel = panels.get(id);
        if (!panel) throw new Error("Editor not found");
        await restoreView(panel, snapshot);
      },
    });
    ctx.effect(() =>
      ctx.workbench.registerEditor((shell) => {
        const panel = createPanel(
          shell,
          ctx.documents,
          ctx.workbench,
          () => {
            panels.delete(shell.id);
            ctx.emit("editor/closed", panel);
          },
          () => ctx.emit("editor/activeChanged", active()),
          config.configure,
        );
        panels.set(panel.id, panel);
        ctx.emit("editor/opened", panel);
      }),
    );
    ctx.effect(() => () => {
      for (const panel of panels.values()) panel.dispose();
      panels.clear();
    });
  },
};
