import * as vscode from "vscode";
import type { Plugin } from "@workshop/core";
import type {} from "../services";
import { ZEN_COMMAND_IDS } from "../../../shared/command-ids";
import manifest from "./manifest";
import { StatusBarAfterZen, type StatusBarSetting } from "./status-bar";

/**
 * Zen mode for PDFs: VS Code's own Zen Mode (hidden sidebar, status bar and
 * panels, full screen, the reader's `zenMode.*` settings), plus the viewer's
 * part of it. The viewers are told while it lasts, so the controls that VS
 * Code hides in zen (the editor title actions, the status bar) are a floating
 * bar instead, with an Exit zen button. Core has no way to ask "is zen on?",
 * so there are two commands, chosen by the `inZenMode` context key in menus
 * and keybindings; the viewer reports when full-screen zen ends without them
 * (Ctrl+K Z, the Command Palette). Leaving zen gives back the status bar,
 * which Cursor otherwise keeps hidden (see `StatusBarAfterZen`).
 */
export const pdfZenPlugin: Plugin = {
  name: manifest.id,
  inject: { required: ["pdfPanels"] },
  apply(ctx) {
    const panels = ctx.pdfPanels;
    let on = false;
    const statusBar = new StatusBarAfterZen(userStatusBarSetting());
    const show = (next: boolean): void => {
      on = next;
      for (const panel of panels.all) {
        panel.setZen(next);
      }
    };
    const left = async (): Promise<void> => {
      show(false);
      await statusBar.left();
    };
    const enter = async (): Promise<void> => {
      statusBar.entering();
      show(true);
      try {
        await vscode.commands.executeCommand("workbench.action.toggleZenMode");
      } catch (error) {
        await left();
        throw error;
      }
    };
    const exit = async (): Promise<void> => {
      show(false);
      await vscode.commands.executeCommand("workbench.action.exitZenMode");
      await statusBar.left();
    };
    ctx.own(
      panels.onDidOpen((panel) => panel.setZen(on)),
      "listener",
    );
    ctx.own(
      panels.handle("zen", (_panel, message) =>
        message.exit ? exit() : left(),
      ),
      "message handler",
    );
    ctx.own(
      vscode.commands.registerCommand(ZEN_COMMAND_IDS.enterZen, enter),
      "command",
    );
    ctx.own(
      vscode.commands.registerCommand(ZEN_COMMAND_IDS.exitZen, exit),
      "command",
    );
    ctx.own({ dispose: () => show(false) }, "viewer zen state");
  },
};

/** The user-level value: Cursor writes zen's change there. */
function userStatusBarSetting(): StatusBarSetting {
  const KEY = "statusBar.visible";
  const workbench = () => vscode.workspace.getConfiguration("workbench");
  return {
    get: () => workbench().inspect<boolean>(KEY)?.globalValue,
    set: (value: boolean | undefined) =>
      workbench().update(KEY, value, vscode.ConfigurationTarget.Global),
  };
}
