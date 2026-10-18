import * as vscode from "vscode";
import { titleActionsInMenu } from "../../../shared/toolbar-settings";
import type { Plugin } from "@workshop/core";
import type {} from "@workshop/platform";
import type {} from "../services";
import { TOOLBAR_COMMAND_IDS } from "../pdf/registered-commands";
import manifest from "./manifest";
import { selectToolbarMode } from "./mode-picker";
import { ToolbarPreferences } from "./preferences";
import { StatusBar } from "./status-bar";

/**
 * Where the viewer's controls are: the status bar entries for the active PDF
 * (in the `chrome` mode), the viewer's own slim or floating bar, the
 * setting's live updates, and the command that picks the mode. The editor
 * title actions are contributed in package.json and follow the same setting.
 */
export const pdfToolbarPlugin: Plugin = {
  name: manifest.id,
  inject: {
    required: ["pdfPanels", "pdfSettings", "extensionContext", "os"],
  },
  apply(ctx) {
    const panels = ctx.pdfPanels;
    const preferences = ctx.own(
      new ToolbarPreferences(ctx.extensionContext.globalState),
      "preferences",
    );
    // Where the title bar would only add the viewer's buttons to its "…" menu,
    // they would repeat that menu's own page and zoom entries: leave them out.
    void vscode.commands.executeCommand(
      "setContext",
      "pdfWorkshop.titleActionsInMenu",
      titleActionsInMenu(vscode.env.appName),
    );
    // Lifecycle work: the reset is returned, so teardown awaits it.
    ctx.own(
      {
        dispose: () =>
          vscode.commands.executeCommand(
            "setContext",
            "pdfWorkshop.titleActionsInMenu",
            false,
          ),
      },
      "context key",
    );
    const statusBar = ctx.own(new StatusBar(panels, ctx.os), "statusBar");
    ctx.own(
      panels.provideViewerToolbar(() => preferences.settings),
      "viewer settings",
    );
    ctx.own(
      panels.handle("floatingDock", (_panel, message) =>
        preferences.setDock(message.dock),
      ),
      "message handler",
    );
    const follow = (): void => {
      const settings = preferences.settings;
      // Every open viewer follows, the one the bar was dragged in included.
      for (const panel of panels.all) {
        panel.setToolbar(settings);
      }
      statusBar.update();
    };
    ctx.own(preferences.onDidChange(follow), "listener");
    ctx.own(
      vscode.commands.registerCommand(
        TOOLBAR_COMMAND_IDS.selectToolbarMode,
        () => selectToolbarMode(ctx.pdfSettings),
      ),
      "command",
    );
    // Viewers opened before this plugin started got the default layout.
    follow();
  },
};
