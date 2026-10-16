import * as vscode from "vscode";
import type { Context, Plugin } from "../../kernel";
import type {} from "../editor/api";
import { contributionId } from "../../shared/setting-schema";
import { buildMwIdeContextPacket } from "./adapter";
import { copyIdeContext, sendIdeContext } from "./delivery";
import type { IdeContextTargetSetting } from "../../shared/ide-context";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
const { readdir: readTempDir } = fs;
import * as fssync from "node:fs";
import {
  createVsCodeIdeContextHost,
  publishIdeContextTemp,
  renewLeaseAtomic,
} from "../../shared/ide-context";
import type { TempFs } from "../../shared/ide-context";

/** Node fs adapter for temp publish. */
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

export const ideContextHost: Plugin = {
  name: "ideContext",
  inject: { required: ["editors", "selections", "workshop"] },
  apply(ctx) {
    const workshop = ctx.workshop;
    // Workbench host-only: editor registerActiveContexts does not cover us.
    const contextReady = workshop
      .execute("setContext", contributionId("plugin.ideContext"), true)
      .catch((error) =>
        ctx.logger.warn("ideContext command context failed", error),
      );
    ctx.effect(() => async () => {
      await contextReady;
      await workshop.execute(
        "setContext",
        contributionId("plugin.ideContext"),
        undefined,
      );
    });
    ctx.effect(() =>
      workshop.command(contributionId("ideContext.copy"), () => runCopy(ctx)),
    );
    ctx.effect(() =>
      workshop.command(contributionId("ideContext.send"), () => runSend(ctx)),
    );
  },
};

async function gatherInput(ctx: Context) {
  const panel = ctx.editors.active();
  if (!panel) {
    ctx.workshop.inform?.("Open a Markdown Workshop note first");
    return undefined;
  }
  const selection = await ctx.selections.capture(panel.id);
  const host = createVsCodeIdeContextHost(vscode);
  return {
    uri: panel.document.uri,
    editorKind: "livePreview" as const,
    panelId: panel.id,
    ...(selection ? { selection } : {}),
    host,
  };
}

async function runCopy(ctx: Context): Promise<void> {
  const input = await gatherInput(ctx);
  if (!input) {
    return;
  }
  const packet = buildMwIdeContextPacket(input);
  await copyIdeContext(
    packet,
    (t) => ctx.workshop.clipboard.write(t),
    (m) => ctx.workshop.inform?.(m),
  );
}

async function runSend(ctx: Context): Promise<void> {
  const input = await gatherInput(ctx);
  if (!input) {
    return;
  }
  const packet = buildMwIdeContextPacket(input);
  const environment = await ctx.workshop.agentEnvironment?.();
  const setting = (environment?.target ?? "auto") as IdeContextTargetSetting;
  const commands = environment?.commands ?? new Set<string>();
  await sendIdeContext(packet, {
    setting,
    commands,
    clipboardWrite: (t) => ctx.workshop.clipboard.write(t),
    executeCommand: (id, ...args) => ctx.workshop.execute(id, ...args),
    showQuickPick: async (items) => {
      const labels = items.map((i) => i.label);
      const choice = await ctx.workshop.views?.ask?.(
        "Send IDE Context to…",
        labels,
      );
      if (!choice) {
        return undefined;
      }
      return items.find((i) => i.label === choice)?.id;
    },
    inform: (m) => ctx.workshop.inform?.(m),
    publishTemp: publishIdeContextTemp,
    renewLease: renewLeaseAtomic,
    tempFs: nodeTempFs,
    tempDir: path.join(os.tmpdir(), "agent-ide-context"),
    owner: "markdownWorkshop",
  });
}
