import type { Manifest } from "../../shared/manifest";
import { captureView, restoreView } from "./view-transfer";
import type { PanelShell } from "../../shared/runtime";
import type { Context, Plugin } from "../../kernel";
import type {} from "../document/api";
import type {} from "../vault/api";
import type { EditorPanel } from "./api";
import { createPanel } from "./panel";
import { protocol } from "./protocol";
interface EditorHostConfig {
  features?: readonly Manifest[];
  configure: (context: Context, panel: PanelShell) => void;
}
export const editorHost: Plugin<EditorHostConfig> = {
  name: "editor",
  inject: { required: ["workbench", "documents"], optional: ["vaults"] },
  apply(ctx, config) {
    const panels = new Map<string, EditorPanel>();
    const active = () => [...panels.values()].find((panel) => panel.active());
    registerActiveContexts(ctx, config.features ?? [], active);
    provideEditors(ctx, panels, active);
    ctx.effect(() =>
      ctx.workbench.registerEditor((shell) => {
        const panel = createPanel(shell, ctx.documents, ctx.workbench, {
          onClose: () => {
            panels.delete(shell.id);
            ctx.emit("editor/closed", panel);
          },
          onState: () => ctx.emit("editor/activeChanged", active()),
          configure(context, panel) {
            // Panel kernels are isolated; share the window-level registry explicitly.
            if (ctx.vaults) {
              context.provide("vaults", ctx.vaults);
            }
            config.configure(context, panel);
          },
          rank: ctx.runtime.rank,
        });
        panels.set(panel.id, panel);
        // The endpoint is disposed with the panel, which removes this listener.
        panel.rpc.on(protocol, "selectionChanged", ({ hasSelection }) =>
          ctx.emit("editor/selectionChanged", panel, hasSelection),
        );
        panel.rpc.on(protocol, "initialized", () =>
          ctx.emit("editor/ready", panel),
        );
        ctx.emit("editor/opened", panel);
      }),
    );
    ctx.effect(() => () => {
      for (const panel of panels.values()) {
        panel.dispose();
      }
      panels.clear();
    });
  },
};

function registerActiveContexts(
  ctx: Context,
  features: readonly Manifest[],
  active: () => EditorPanel | undefined,
): void {
  const contexts = () => {
    const panel = active();
    const settings = panel ? ctx.workbench.config(panel.document) : undefined;
    for (const manifest of features) {
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
    for (const id of ["editor", "commands", "livePreview"]) {
      void ctx.workbench.execute(
        "setContext",
        `markdownWorkbench.plugin.${id}`,
        Boolean(active()),
      );
    }
  };
  if (ctx.workbench.onConfiguration) {
    ctx.effect(() => ctx.workbench.onConfiguration!(contexts));
  }
  ctx.on("editor/activeChanged", contexts);
  ctx.on("editor/opened", contexts);
  ctx.on("editor/closed", contexts);
}

function provideEditors(
  ctx: Context,
  panels: Map<string, EditorPanel>,
  active: () => EditorPanel | undefined,
): void {
  ctx.provide("editors", {
    all: () => [...panels.values()],
    active,
    async capture(id) {
      const panel = panels.get(id);
      if (!panel) {
        throw new Error("Editor not found");
      }
      return captureView(panel);
    },
    async restore(id, snapshot) {
      const panel = panels.get(id);
      if (!panel) {
        throw new Error("Editor not found");
      }
      await restoreView(panel, snapshot);
    },
  });
}
