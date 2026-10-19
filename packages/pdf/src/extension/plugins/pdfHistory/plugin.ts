import * as vscode from "vscode";
import type { Plugin } from "@workshop/core";
import type {} from "../services";
import { HISTORY_COMMAND_IDS } from "../pdf/registered-commands";
import { PdfHistories } from "./histories";
import manifest from "./manifest";

/** A separate memory-only stack for each editor, including split views of one PDF. */
export const pdfHistoryPlugin: Plugin = {
  name: manifest.id,
  inject: { required: ["pdfPanels"] },
  apply(ctx) {
    const panels = ctx.pdfPanels;
    const histories = ctx.own(new PdfHistories(panels), "memory history");
    ctx.own(
      panels.handle("historyJump", (panel, message) =>
        histories.recordJump(panel, message.from, message.to),
      ),
      "jump handler",
    );
    ctx.own(
      panels.handle("historyTraverse", (panel, message) =>
        histories.traverse(panel, message.direction),
      ),
      "traverse handler",
    );
    ctx.own(
      panels.onDidChange(() => histories.panelsChanged()),
      "listener",
    );
    ctx.own(
      vscode.commands.registerCommand(HISTORY_COMMAND_IDS.historyBack, () =>
        histories.traverse(panels.active, "back"),
      ),
      "command",
    );
    ctx.own(
      vscode.commands.registerCommand(HISTORY_COMMAND_IDS.historyForward, () =>
        histories.traverse(panels.active, "forward"),
      ),
      "command",
    );
    histories.publish();
  },
};
