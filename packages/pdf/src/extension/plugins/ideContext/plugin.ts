import * as vscode from "vscode";
import type { Plugin } from "@workshop/core";
import type { AgentFiles } from "@workshop/platform";
import type {} from "../services";
import manifest from "./manifest";
import { IDE_CONTEXT_COMMAND_IDS } from "../pdf/registered-commands";
import { buildPdfIdeContextPacket } from "./adapter";
import {
  copyIdeContext,
  sendIdeContext,
  type SendIdeContextDeps,
} from "./delivery";
import {
  createVsCodeIdeContextHost,
  publishIdeContextTemp,
  renewLeaseAtomic,
  type IdeContextTargetSetting,
} from "@workshop/agents/ide-context";
import type { AgentTargetSetting } from "../../../shared/agent-target";
import type { PdfPanels } from "../pdf/panels";

export const ideContextPlugin: Plugin = {
  name: manifest.id,
  inject: {
    required: ["pdfPanels"],
    optional: ["regionSnapshots", "pdfHandoff", "agentFiles"],
  },
  apply(ctx) {
    const panels = ctx.pdfPanels;
    ctx.own(
      vscode.commands.registerCommand(
        IDE_CONTEXT_COMMAND_IDS.copy,
        async () => {
          const packet = activePacket(panels);
          if (packet) {
            await copyIdeContext(packet, writeClipboard, inform);
          }
        },
      ),
      "command",
    );
    ctx.own(
      vscode.commands.registerCommand(
        IDE_CONTEXT_COMMAND_IDS.send,
        async () => {
          const packet = activePacket(panels);
          if (packet) {
            await sendIdeContext(packet, await sendDeps(ctx.agentFiles));
          }
        },
      ),
      "command",
    );
  },
};

/** The IDE context of the active PDF and its selection; warns without one. */
function activePacket(panels: PdfPanels) {
  const panel = panels.active;
  if (!panel) {
    void vscode.window.showWarningMessage("Open a PDF first");
    return undefined;
  }
  const selected = panel.selectionSnapshot() ?? undefined;
  return buildPdfIdeContextPacket({
    uri: panel.uri.toString(),
    selection: selected?.selection,
    ...(selected ? { sourceSha256: selected.sha256 } : {}),
    host: createVsCodeIdeContextHost(vscode),
  });
}

async function writeClipboard(text: string): Promise<void> {
  await vscode.env.clipboard.writeText(text);
}

function inform(message: string): void {
  void vscode.window.showInformationMessage(message);
}

/**
 * Send IDE Context's target setting and its VS Code side. Codex gets a temp
 * file only where the platform has agent files (desktop).
 */
async function sendDeps(
  agentFiles: AgentFiles | undefined,
): Promise<SendIdeContextDeps> {
  const setting = vscode.workspace
    .getConfiguration("pdfWorkshop")
    .get<AgentTargetSetting>("copyLinkForAgent.target", "auto");
  return {
    setting: setting as IdeContextTargetSetting,
    commands: new Set(await vscode.commands.getCommands(true)),
    clipboardWrite: writeClipboard,
    executeCommand: async (id, ...args) =>
      vscode.commands.executeCommand(id, ...args),
    showQuickPick: async (items) => {
      const pick = await vscode.window.showQuickPick(
        items.map((item) => ({ label: item.label, id: item.id })),
        { title: "Send IDE Context to…" },
      );
      return pick?.id;
    },
    inform,
    publishTemp: publishIdeContextTemp,
    renewLease: renewLeaseAtomic,
    ...(agentFiles && { temp: agentFiles.ideContext }),
    owner: "pdfWorkshop",
  };
}
