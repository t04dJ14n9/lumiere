import { featureCommands } from "./features";
import type { Manifest } from "../../shared/manifest";
import type { Fiber, Plugin } from "../../kernel";
import type { EditorPanel } from "../editor/api";
import { protocol } from "./protocol";
export const commandsHost: Plugin<{ features: readonly Manifest[] }> = {
  name: "commands",
  inject: { required: ["workbench", "editors"] },
  apply(ctx, config) {
    featureCommands(ctx, config.features);
    const panels = new Map<string, Fiber>();
    function bind(panel: EditorPanel): void {
      const fiber = ctx.plugin({
        name: `commands:${panel.id}`,
        apply(owned) {
          owned.effect(() =>
            panel.rpc.handle(protocol, "action", ({ action }) =>
              panel.session.withAction(async () => {
                await ctx.serial("document/willSave", panel.session);
                await panel.session.flush();
                if (action !== "save" && !panel.active()) {
                  throw new Error(
                    "The editor lost focus before the command completed.",
                  );
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
                  await ctx.workbench.execute(
                    "vscode.openWith",
                    panel.document.uri,
                    "default",
                  );
                }
                if (action === "close" || action === "saveClose") {
                  if (!panel.active()) {
                    throw new Error("Editor no longer active");
                  }
                  await ctx.workbench.execute(
                    "workbench.action.closeActiveEditor",
                  );
                }
                return true;
              }),
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
    for (const action of [
      "save",
      "undo",
      "redo",
      "close",
      "saveClose",
      "openAsText",
    ] as const) {
      ctx.effect(() =>
        ctx.workbench.command(`markdownWorkbench.${action}`, () =>
          ctx.editors.active()?.rpc.call(protocol, "run", { command: action }),
        ),
      );
    }
  },
};
