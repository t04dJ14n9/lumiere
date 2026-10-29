import type { Context, Plugin } from "@workshop/core";
import type {} from "../editor/api";
import { contributionId } from "../../shared/setting-schema";
import { buildMwIdeContextPacket } from "./adapter";
import { copyIdeContext, sendIdeContext } from "./delivery";
import type { IdeContextTargetSetting } from "@workshop/agents/ide-context";
import type { IdeContextTemp } from "../../shared/host";
import {
  publishIdeContextTemp,
  renewLeaseAtomic,
} from "@workshop/agents/ide-context";

export const ideContextHost: Plugin = {
  name: "ideContext",
  inject: {
    required: [
      "editors",
      "selections",
      "hostCommands",
      "clipboard",
      "dialogs",
      "agentHost",
    ],
  },
  apply(ctx) {
    // Captured while live: the context-key reset runs after it is disposed.
    const commands = ctx.hostCommands;
    // Window plugin: editor registerActiveContexts does not cover us.
    const contextReady = commands
      .execute("setContext", contributionId("plugin.ideContext"), true)
      .catch((error) =>
        ctx.logger.warn("ideContext command context failed", error),
      );
    ctx.effect(() => async () => {
      await contextReady;
      await commands.execute(
        "setContext",
        contributionId("plugin.ideContext"),
        undefined,
      );
    });
    ctx.effect(() =>
      commands.register(contributionId("ideContext.copy"), () => runCopy(ctx)),
    );
    ctx.effect(() =>
      commands.register(contributionId("ideContext.send"), () => runSend(ctx)),
    );
  },
};

async function gatherInput(ctx: Context) {
  const panel = ctx.editors.active();
  if (!panel) {
    ctx.dialogs.inform("Open a Lumière note first");
    return undefined;
  }
  const host = ctx.agentHost.ideContextHost?.();
  if (!host) {
    ctx.dialogs.inform("IDE context is not available in this editor");
    return undefined;
  }
  const selection = await ctx.selections.capture(panel.id);
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
    (t) => ctx.clipboard.write(t),
    (m) => ctx.dialogs.inform(m),
  );
}

async function runSend(ctx: Context): Promise<void> {
  const input = await gatherInput(ctx);
  if (!input) {
    return;
  }
  const packet = buildMwIdeContextPacket(input);
  const environment = await ctx.agentHost.environment();
  const setting = (environment?.target ?? "auto") as IdeContextTargetSetting;
  const commands = environment?.commands ?? new Set<string>();
  await sendIdeContext(packet, {
    setting,
    commands,
    clipboardWrite: (t) => ctx.clipboard.write(t),
    executeCommand: (id, ...args) => ctx.hostCommands.execute(id, ...args),
    showQuickPick: async (items) => {
      const labels = items.map((i) => i.label);
      const choice = await ctx.dialogs.ask("Send IDE Context to…", labels);
      if (!choice) {
        return undefined;
      }
      return items.find((i) => i.label === choice)?.id;
    },
    inform: (m) => ctx.dialogs.inform(m),
    publishTemp: publishIdeContextTemp,
    renewLease: renewLeaseAtomic,
    // Only where an agent reads files (VS Code); elsewhere Codex gets the clipboard.
    ...temporaryFiles(ctx.agentHost.ideContextTemp),
    owner: "markdownWorkshop",
  });
}

function temporaryFiles(temp: IdeContextTemp | undefined) {
  return temp
    ? { tempFs: temp.fs, tempDir: temp.dir, tempFileUri: temp.fileUri }
    : {};
}
