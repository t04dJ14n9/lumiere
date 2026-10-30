import * as vscode from "vscode";
import type { Plugin } from "@workshop/core";
import { VIEW_COMMAND_IDS } from "../../../shared/command-ids";
import manifest from "./manifest";
import type {} from "../services";

export const pdfAnnotationsPlugin: Plugin = {
  name: manifest.id,
  inject: { required: ["pdfPanels", "extensionContext"] },
  apply(ctx) {
    const panels = ctx.pdfPanels;

    const attach = (panel: (typeof panels.all)[number]): void => {
      ctx.own(
        panel.onAnnotationConflict(async (payload) => {
          const choice = await vscode.window.showWarningMessage(
            "This PDF changed on disk while you were annotating.",
            { modal: true },
            "Reload",
            "Keep mine",
          );
          if (choice === "Reload") {
            await panel.reloadFromDisk();
          } else if (choice === "Keep mine") {
            await panel.keepMine(payload.data, payload.load);
          }
        }),
        `conflict:${panel.viewId}`,
      );
      ctx.own(
        panel.onAnnotationSaveFailed(async () => {
          const choice = await vscode.window.showErrorMessage(
            "Could not save PDF annotations.",
            "Retry",
          );
          if (choice === "Retry") {
            panel.postAnnotationRetry();
          }
        }),
        `fail:${panel.viewId}`,
      );
    };

    for (const panel of panels.all) {
      attach(panel);
    }
    ctx.own(
      panels.onDidOpen((panel) => attach(panel)),
      "open listener",
    );

    ctx.own(
      vscode.commands.registerCommand(
        VIEW_COMMAND_IDS.annotationRetrySave,
        () => panels.active?.postAnnotationRetry(),
      ),
      "retry command",
    );
  },
};
