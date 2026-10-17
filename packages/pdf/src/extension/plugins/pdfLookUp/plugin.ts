import * as vscode from "vscode";
import { lookUpEnabled, lookUpUrl } from "../../../shared/look-up";
import type { Plugin } from "@workshop/core";
import type {} from "../services";
import { LOOK_UP_COMMAND_IDS } from "../pdf/registered-commands";
import manifest from "./manifest";

const SETTING = "pdfWorkshop.lookUp.enabled";

/**
 * macOS Look Up for PDFs (a force click on a word, or Look Up in the context
 * menu). The viewer finds the word; this plugin opens it in the Dictionary
 * app. It does nothing off macOS or with `pdfWorkshop.lookUp.enabled` off,
 * and stopping the plugin turns the viewers' side off again.
 */
export const pdfLookUpPlugin: Plugin = {
  name: manifest.id,
  inject: { required: ["pdfPanels"] },
  apply(ctx) {
    const panels = ctx.pdfPanels;
    const enabled = (): boolean =>
      lookUpEnabled(
        process.platform,
        vscode.workspace.getConfiguration().get<boolean>(SETTING, true),
      );
    const open = async (word: string | undefined): Promise<void> => {
      if (word && enabled()) {
        await vscode.env.openExternal(vscode.Uri.parse(lookUpUrl(word), true));
      }
    };
    const apply = (): void => {
      for (const panel of panels.all) {
        panel.setLookUp(enabled());
      }
    };
    apply();
    ctx.own(
      panels.onDidOpen((panel) => panel.setLookUp(enabled())),
      "listener",
    );
    ctx.own(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration(SETTING)) {
          apply();
        }
      }),
      "listener",
    );
    ctx.own(
      panels.handle("lookUp", async (_panel, message) => {
        if (!enabled()) {
          return;
        }
        if (message.open) {
          await open(message.word ?? undefined);
        }
      }),
      "message handler",
    );
    ctx.own(
      vscode.commands.registerCommand(LOOK_UP_COMMAND_IDS.lookUp, () => {
        if (enabled()) {
          panels.active?.requestLookUp();
        }
      }),
      "command",
    );
    ctx.own(
      {
        dispose: () => {
          for (const panel of panels.all) {
            panel.setLookUp(false);
          }
        },
      },
      "viewer switch and context key",
    );
  },
};
