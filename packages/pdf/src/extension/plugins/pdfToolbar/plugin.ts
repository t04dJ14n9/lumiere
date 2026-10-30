import * as vscode from "vscode";
import type { Context, Plugin } from "@workshop/core";
import type {} from "../services";
import type { PdfSettings } from "../../settings";
import {
  TOOLBAR_COMMAND_IDS,
  VIEW_COMMAND_IDS,
} from "../../../shared/command-ids";
import type { PdfPanels } from "../pdf/panels";
import manifest from "./manifest";
import { pickAnnotationTool, toggleAnnotate } from "./annotation-picker";
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
    keepTitleActionsHidden(ctx);
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
    const follow = wireToolbarFollow(ctx, preferences, panels, statusBar);
    registerToolbarCommands(ctx, panels, ctx.pdfSettings);
    ctx.own(watchPageColors(panels), "page colors");
    wireStatusBarRefresh(ctx, statusBar);
    follow();
    publishPageColors(panels);
  },
};

function keepTitleActionsHidden(ctx: Context): void {
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
}

function wireToolbarFollow(
  ctx: Context,
  preferences: ToolbarPreferences,
  panels: PdfPanels,
  statusBar: StatusBar,
): () => void {
  const follow = (): void => {
    const settings = preferences.settings;
    for (const panel of panels.all) {
      panel.setToolbar(settings);
    }
    statusBar.update();
  };
  ctx.own(preferences.onDidChange(follow), "listener");
  return follow;
}

function registerToolbarCommands(
  ctx: Context,
  panels: PdfPanels,
  settings: PdfSettings,
): void {
  ctx.own(
    vscode.commands.registerCommand(TOOLBAR_COMMAND_IDS.selectToolbarMode, () =>
      selectToolbarMode(settings),
    ),
    "command",
  );
  ctx.own(
    vscode.commands.registerCommand(TOOLBAR_COMMAND_IDS.cyclePageColors, () =>
      cycleAndPublish(settings, panels),
    ),
    "command",
  );
  ctx.own(
    vscode.commands.registerCommand(
      VIEW_COMMAND_IDS.toggleAnnotateTool,
      () => toggleAnnotate(panels),
    ),
    "toggle annotate",
  );
  ctx.own(
    vscode.commands.registerCommand(
      VIEW_COMMAND_IDS.pickAnnotationTool,
      () => pickAnnotationTool(panels),
    ),
    "pick annotation tool",
  );
}

function wireStatusBarRefresh(ctx: Context, statusBar: StatusBar): void {
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
}
