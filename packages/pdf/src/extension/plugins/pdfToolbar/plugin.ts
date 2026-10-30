import * as vscode from "vscode";
import type { Plugin } from "@workshop/core";
import type {} from "../services";
import { TOOLBAR_COMMAND_IDS } from "../../../shared/command-ids";
import manifest from "./manifest";
import { selectToolbarMode } from "./mode-picker";
import {
  cycleAndPublish,
  publishPageColors,
  watchPageColors,
} from "./page-colors";
import { ToolbarPreferences } from "./preferences";
import { StatusBar } from "./status-bar";

/**
 * Where the viewer's controls are: the status bar entries for the active PDF
 * (in the `chrome` mode), page colors, the setting's live updates, and the
 * command that picks the mode. Slim and floating viewer bars are removed.
 */
export const pdfToolbarPlugin: Plugin = {
  name: manifest.id,
  inject: { required: ["pdfPanels", "pdfSettings", "extensionContext"] },
  apply(ctx) {
    const panels = ctx.pdfPanels;
    const preferences = ctx.own(
      new ToolbarPreferences(ctx.extensionContext.globalState),
      "preferences",
    );
    // Title-bar PDF strip is gone; keep the context key true so leftover
    // when-clauses that still mention `!titleActionsInMenu` stay off.
    void vscode.commands.executeCommand(
      "setContext",
      "lumiere.pdf.titleActionsInMenu",
      true,
    );
    ctx.own(
      {
        dispose: () =>
          vscode.commands.executeCommand(
            "setContext",
            "lumiere.pdf.titleActionsInMenu",
            false,
          ),
      },
      "context key",
    );
    const statusBar = ctx.own(new StatusBar(panels), "statusBar");
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
    ctx.own(
      vscode.commands.registerCommand(TOOLBAR_COMMAND_IDS.cyclePageColors, () =>
        cycleAndPublish(ctx.pdfSettings, panels),
      ),
      "command",
    );
    ctx.own(watchPageColors(panels), "page colors");
    ctx.own(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (
          event.affectsConfiguration("lumiere.pdf.toolbar") ||
          event.affectsConfiguration("lumiere.pdf.pageColors")
        ) {
          statusBar.update();
        }
      }),
      "status bar settings",
    );
    ctx.own(
      vscode.window.onDidChangeActiveColorTheme(() => statusBar.update()),
      "status bar theme",
    );
    follow();
    publishPageColors(panels);
  },
};
