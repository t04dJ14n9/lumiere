import { pathToFileUriString } from "./file-uri";
import { AGENT_COMMANDS } from "../../../shared/agent-target";
import {
  publishIdeContextTemp,
  renewLeaseAtomic,
  leasePathFor,
  renderMarkdown,
  serializeJson,
  resolveIdeContextSendTarget,
  type IdeContextPacket,
  type IdeContextTargetSetting,
  type TempFs,
  type LeaseSidecar,
} from "@workshop/agents/ide-context";

export type QuickPickChoice = "claudeCode" | "codex" | "clipboard" | undefined;

export interface SendIdeContextDeps {
  setting: IdeContextTargetSetting;
  commands: ReadonlySet<string>;
  clipboardWrite: (text: string) => Promise<void>;
  executeCommand: (id: string, ...args: unknown[]) => Promise<unknown>;
  showQuickPick: (
    items: { label: string; id: "claudeCode" | "codex" | "clipboard" }[],
  ) => Promise<QuickPickChoice>;
  inform?: (message: string) => void;
  publishTemp?: typeof publishIdeContextTemp;
  renewLease?: typeof renewLeaseAtomic;
  tempFs?: TempFs;
  tempDir?: string;
  now?: () => number;
  leaseMs?: number;
  owner?: LeaseSidecar["owner"];
  sessionId?: string;
  codexRetryDelaysMs?: readonly number[];
}

export interface SendIdeContextResult {
  markdown: string;
  opened: "claudeCode" | "codex" | "clipboard" | "cancelled";
  softFailWarning?: string;
}

export async function copyIdeContext(
  packet: IdeContextPacket,
  clipboardWrite: (text: string) => Promise<void>,
  inform?: (message: string) => void,
): Promise<string> {
  const md = renderMarkdown(packet);
  await clipboardWrite(md);
  inform?.("IDE context copied");
  return md;
}

export async function sendIdeContext(
  packet: IdeContextPacket,
  deps: SendIdeContextDeps,
): Promise<SendIdeContextResult> {
  const md = renderMarkdown(packet);
  await deps.clipboardWrite(md);

  const resolved = resolveIdeContextSendTarget(deps.setting, {
    commands: deps.commands,
  });
  let target: "claudeCode" | "codex" | "clipboard" | "cancelled";
  if (resolved === "picker") {
    const pick = await deps.showQuickPick([
      { label: "Claude Code", id: "claudeCode" },
      { label: "Codex", id: "codex" },
      { label: "Copy only", id: "clipboard" },
    ]);
    if (pick === undefined) {
      return { markdown: md, opened: "cancelled" };
    }
    target = pick;
  } else {
    target = resolved;
  }

  if (target === "clipboard") {
    deps.inform?.("IDE context copied");
    return { markdown: md, opened: "clipboard" };
  }
  if (target === "claudeCode") {
    await deps.executeCommand(
      AGENT_COMMANDS.claudeCodeOpen,
      undefined,
      `${md}\n\n`,
    );
    return { markdown: md, opened: "claudeCode" };
  }

  const publish = deps.publishTemp ?? publishIdeContextTemp;
  const renew = deps.renewLease ?? renewLeaseAtomic;
  const fs = deps.tempFs;
  if (!fs) {
    return { markdown: md, opened: "clipboard", softFailWarning: "no temp fs" };
  }
  const dir = deps.tempDir ?? "/tmp/agent-ide-context";
  const now = deps.now ?? (() => Date.now());
  const leaseMs = deps.leaseMs ?? 60_000;
  const owner = deps.owner ?? "pdfWorkshop";
  const sessionId = deps.sessionId ?? `pdf-${now()}`;
  const basename = `ide-context-${sessionId}.json`;
  const published = await publish(fs, {
    dir,
    basename,
    bytes: Buffer.from(serializeJson(packet)),
    owner,
    sessionId,
    now,
    leaseMs,
  });
  if ("skipped" in published && published.skipped) {
    deps.inform?.(published.warning);
    return {
      markdown: md,
      opened: "clipboard",
      softFailWarning: published.warning,
    };
  }
  const finalPath = "finalPath" in published ? published.finalPath : "";
  const delays = deps.codexRetryDelaysMs ?? [0, 10];
  let attached = false;
  for (let i = 0; i < delays.length; i++) {
    if (i > 0 && delays[i]! > 0) {
      await new Promise((r) => setTimeout(r, delays[i]));
    }
    try {
      // Delay + open first on retry; renew immediately before add-file so the
      // lease cannot expire during prep work after renewal.
      await deps.executeCommand(AGENT_COMMANDS.codexOpen);
      if (i > 0) {
        await renew(fs, leasePathFor(finalPath), {
          leaseUntil: new Date(now() + leaseMs).toISOString(),
          owner,
          sessionId,
        });
      }
      await deps.executeCommand(
        AGENT_COMMANDS.codexAddFile,
        pathToFileUriString(finalPath),
      );
      attached = true;
      break;
    } catch {
      /* retry */
    }
  }
  if (!attached) {
    return {
      markdown: md,
      opened: "clipboard",
      softFailWarning: "codex attach failed",
    };
  }
  return { markdown: md, opened: "codex" };
}
