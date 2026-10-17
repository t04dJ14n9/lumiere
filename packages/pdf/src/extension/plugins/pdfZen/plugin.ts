import * as vscode from "vscode";
import type { Plugin } from "@workshop/core";
import type {} from "../services";
import { ZEN_COMMAND_IDS } from "../pdf/registered-commands";
import manifest from "./manifest";

/**
 * Zen mode for PDFs: VS Code's own Zen Mode (hidden sidebar, status bar and
 * panels, full screen, the reader's `zenMode.*` settings), plus the viewer's
 * part of it. The viewers are told while it lasts, so the controls that VS
 * Code hides in zen (the editor title actions, the status bar) are a floating
 * bar instead, with an Exit zen button. Core has no way to ask "is zen on?",
 * so there are two commands, chosen by the `inZenMode` context key in menus
 * and keybindings; the viewer reports when full-screen zen ends without them
 * (Ctrl+K Z, the Command Palette).
 */
export const pdfZenPlugin: Plugin = {
  name: manifest.id,
  inject: { required: ["pdfPanels"] },
  apply(ctx) {
    const panels = ctx.pdfPanels;
    let on = false;
    const show = (next: boolean): void => {
      on = next;
      for (const panel of panels.all) {
        panel.setZen(next);
      }
    };
    const enter = async (): Promise<void> => {
      show(true);
      try {
        await vscode.commands.executeCommand("workbench.action.toggleZenMode");
      } catch (error) {
        show(false);
        throw error;
      }
    };
    const exit = async (): Promise<void> => {
      show(false);
      await vscode.commands.executeCommand("workbench.action.exitZenMode");
    };
    ctx.own(
      panels.onDidOpen((panel) => panel.setZen(on)),
      "listener",
    );
    ctx.own(
      panels.handle("zen", (_panel, message) =>
        message.exit ? exit() : show(false),
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
