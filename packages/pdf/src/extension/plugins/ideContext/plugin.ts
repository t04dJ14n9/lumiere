import * as vscode from "vscode";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
const { readdir: readTempDir } = fs;
import * as fssync from "node:fs";
import type { Plugin } from "@workshop/core";
import type {} from "../services";
import manifest from "./manifest";
import { IDE_CONTEXT_COMMAND_IDS } from "../pdf/registered-commands";
import { buildPdfIdeContextPacket } from "./adapter";
import { copyIdeContext, sendIdeContext } from "./delivery";
import {
  createVsCodeIdeContextHost,
  publishIdeContextTemp,
  renewLeaseAtomic,
  type TempFs,
  type IdeContextTargetSetting,
} from "../../../shared/ide-context";
import type { AgentTargetSetting } from "../../../shared/agent-target";

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
  inject: { required: ["pdfPanels"], optional: ["regionSnapshots", "pdfHandoff"] },
  apply(ctx) {
    const panels = ctx.pdfPanels;
    ctx.own(
      vscode.commands.registerCommand(
        IDE_CONTEXT_COMMAND_IDS.copy,
        async () => {
          const panel = panels.active;
          if (!panel) {
            void vscode.window.showWarningMessage("Open a PDF first");
            return;
          }
          const selected = panel.selectionSnapshot() ?? undefined;
          const packet = buildPdfIdeContextPacket({
            uri: panel.uri.toString(),
            selection: selected?.selection,
            ...(selected ? { sourceSha256: selected.sha256 } : {}),
            host: createVsCodeIdeContextHost(vscode),
          });
          await copyIdeContext(
            packet,
            async (t) => {
              await vscode.env.clipboard.writeText(t);
            },
            (m) => {
              void vscode.window.showInformationMessage(m);
            },
          );
        },
      ),
      "command",
    );
    ctx.own(
      vscode.commands.registerCommand(
        IDE_CONTEXT_COMMAND_IDS.send,
        async () => {
          const panel = panels.active;
          if (!panel) {
            void vscode.window.showWarningMessage("Open a PDF first");
            return;
          }
          const selected = panel.selectionSnapshot() ?? undefined;
          const packet = buildPdfIdeContextPacket({
            uri: panel.uri.toString(),
            selection: selected?.selection,
            ...(selected ? { sourceSha256: selected.sha256 } : {}),
            host: createVsCodeIdeContextHost(vscode),
          });
          const setting = vscode.workspace
            .getConfiguration("pdfWorkshop")
            .get<AgentTargetSetting>("copyLinkForAgent.target", "auto");
          const commands = new Set(await vscode.commands.getCommands(true));
          await sendIdeContext(packet, {
            setting: setting as IdeContextTargetSetting,
            commands,
            clipboardWrite: async (t) => {
              await vscode.env.clipboard.writeText(t);
            },
            executeCommand: async (id, ...args) =>
              vscode.commands.executeCommand(id, ...args),
            showQuickPick: async (items) => {
              const pick = await vscode.window.showQuickPick(
                items.map((i) => ({ label: i.label, id: i.id })),
                { title: "Send IDE Context to…" },
              );
              return pick?.id;
            },
            inform: (m) => {
              void vscode.window.showInformationMessage(m);
            },
            publishTemp: publishIdeContextTemp,
            renewLease: renewLeaseAtomic,
            tempFs: nodeTempFs,
            tempDir: path.join(os.tmpdir(), "agent-ide-context"),
            owner: "pdfWorkshop",
          });
        },
      ),
      "command",
    );
  },
};
