import * as vscode from "vscode";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
const { readdir: readTempDir } = fs;
import * as fssync from "node:fs";
import type { Plugin } from "@workshop/core";
import type {} from "../services";
import manifest from "./manifest";
import { IDE_CONTEXT_COMMAND_IDS } from "../../../shared/command-ids";
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
  type TempFs,
  type IdeContextTargetSetting,
} from "@workshop/agents/ide-context";
import type { AgentTargetSetting } from "../../../shared/agent-target";
import type { PdfPanels } from "../pdf/panels";

const nodeTempFs: TempFs = {
  mkdir: async (p, o) => {
    await fs.mkdir(p, { recursive: true, mode: o?.mode });
  },
  writeFile: (p, data, o) => fs.writeFile(p, data, { mode: o?.mode }),
  rename: (a, b) => fs.rename(a, b),
  readFile: (p) => fs.readFile(p),
  unlink: (p) => fs.unlink(p),
  listNames: (p) => readTempDir(p),
  stat: async (p) => {
    const s = await fs.stat(p);
    return {
      mtimeMs: s.mtimeMs,
      size: s.size,
      isFile: () => s.isFile(),
      isDirectory: () => s.isDirectory(),
    };
  },
  renameSync: (a, b) => fssync.renameSync(a, b),
};

export const ideContextPlugin: Plugin = {
  name: manifest.id,
  inject: {
    required: ["pdfPanels"],
    optional: ["regionSnapshots", "pdfHandoff"],
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
            await sendIdeContext(packet, await sendDeps());
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

/** Send IDE Context's target setting and its VS Code side. */
async function sendDeps(): Promise<SendIdeContextDeps> {
  const setting = vscode.workspace
    .getConfiguration("lumiere.pdf")
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
    tempFs: nodeTempFs,
    tempDir: path.join(os.tmpdir(), "agent-ide-context"),
    owner: "pdfWorkshop",
  };
}
