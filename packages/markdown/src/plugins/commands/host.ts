import { featureCommands } from "./features";
import type { Manifest } from "../../shared/manifest";
import { contributionId } from "../../shared/setting-schema";
import type { Context, PluginHandle, Plugin, Infer } from "@workshop/core";
import type { EditorPanel } from "../editor/api";
import { protocol, type action as actionSchema } from "./protocol";
export const commandsHost: Plugin<{ features: readonly Manifest[] }> = {
  name: "commands",
  inject: { required: ["hostCommands", "settings", "editors"] },
  apply(ctx, config) {
    featureCommands(ctx, config.features);
    registerPanelActions(ctx);
    registerHostPalette(ctx);
  },
};

function registerPanelActions(ctx: Context): void {
  const panels = new Map<string, PluginHandle>();
  function bind(panel: EditorPanel): void {
    const fiber = ctx.plugin({
      name: `commands:${panel.id}`,
      apply(owned) {
        owned.effect(() =>
          panel.rpc.handle(protocol, "action", ({ action }) =>
            runPanelAction(ctx, panel, action),
          ),
        );
      },
    });
    panels.set(panel.id, fiber);
  }
  ctx.on("editor/opened", (panel) => {
    const editor = ctx.editors.all().find((p) => p.id === panel.id);
    if (editor) {
      bind(editor);
    }
  });
  ctx.on("editor/closed", (panel) => {
    void panels.get(panel.id)?.dispose();
    panels.delete(panel.id);
  });
  for (const panel of ctx.editors.all()) {
    bind(panel);
  }
}

function registerHostPalette(ctx: Context): void {
  for (const action of [
    "save",
    "undo",
    "redo",
    "close",
    "saveClose",
    "openAsText",
  ] as const) {
    ctx.effect(() =>
      ctx.hostCommands.register(contributionId(action), () =>
        ctx.editors.active()?.rpc.call(protocol, "run", { command: action }),
      ),
    );
  }
}

function runPanelAction(
  ctx: Context,
  panel: EditorPanel,
  action: Infer<typeof actionSchema>,
): Promise<boolean> {
  // Toggle owns its own flush + sibling-tab close (BH-011); invoke the
  // editor-registered host command (no cross-plugin import).
  if (action === "toggleTextEditor") {
    return ctx.hostCommands
      .execute(contributionId("toggleTextEditor"))
      .then(() => true);
  }
  return panel.session.withAction(async () => {
    await ctx.serial("document/willSave", panel.session);
    await panel.session.flush();
    if (action !== "save" && !panel.active()) {
      throw new Error("The editor lost focus before the command completed.");
    }
    if (action === "save" || action === "saveClose") {
      if (!(await panel.session.save())) {
        throw new Error("The note was not saved.");
      }
    }
    if (action === "undo" || action === "redo") {
      await panel.session.history(action);
    }
    if (action === "openAsText") {
      await ctx.hostCommands.execute(
        "vscode.openWith",
        panel.document.uri,
        "default",
      );
    }
    if (action === "close" || action === "saveClose") {
      if (!panel.active()) {
        throw new Error("Editor no longer active");
      }
      await ctx.hostCommands.execute("workbench.action.closeActiveEditor");
    }
    return true;
  });
}
