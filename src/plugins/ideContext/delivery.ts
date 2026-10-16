import { pathToFileUriString } from "./file-uri";
import { IDE_CONTEXT_AGENT_COMMANDS } from "./agent-commands";
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
} from "../../shared/ide-context";

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
  /** Injectable temp publish (defaults unused in pure tests). */
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

/** Copy path: clipboard only — never opens an agent. */
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

type SendTarget = "claudeCode" | "codex" | "clipboard" | "cancelled";

async function pickSendTarget(deps: SendIdeContextDeps): Promise<SendTarget> {
  const resolved = resolveIdeContextSendTarget(deps.setting, {
    commands: deps.commands,
  });
  if (resolved !== "picker") {
    return resolved;
  }
  const pick = await deps.showQuickPick([
    { label: "Claude Code", id: "claudeCode" },
    { label: "Codex", id: "codex" },
    { label: "Copy only", id: "clipboard" },
  ]);
  if (pick === undefined) {
    return "cancelled";
  }
  return pick;
}

async function sendClaude(
  md: string,
  deps: SendIdeContextDeps,
): Promise<SendIdeContextResult> {
  await deps.executeCommand(
    IDE_CONTEXT_AGENT_COMMANDS.claudeCodeOpen,
    undefined,
    `${md}\n\n`,
  );
  return { markdown: md, opened: "claudeCode" };
}

async function attachCodexWithRetries(
  deps: SendIdeContextDeps,
  fs: TempFs,
  args: {
    finalPath: string;
    renew: typeof renewLeaseAtomic;
    now: () => number;
    leaseMs: number;
    owner: LeaseSidecar["owner"];
    sessionId: string;
  },
): Promise<boolean> {
  const delays = deps.codexRetryDelaysMs ?? [0, 10];
  for (let i = 0; i < delays.length; i++) {
    if (i > 0 && delays[i]! > 0) {
      await new Promise((r) => setTimeout(r, delays[i]));
    }
    try {
      // Delay + open first on retry; renew immediately before add-file so the
      // lease cannot expire during prep work after renewal.
      await deps.executeCommand(IDE_CONTEXT_AGENT_COMMANDS.codexOpen);
      if (i > 0) {
        await args.renew(fs, leasePathFor(args.finalPath), {
          leaseUntil: new Date(args.now() + args.leaseMs).toISOString(),
          owner: args.owner,
          sessionId: args.sessionId,
        });
      }
      await deps.executeCommand(
        IDE_CONTEXT_AGENT_COMMANDS.codexAddFile,
        pathToFileUriString(args.finalPath),
      );
      return true;
    } catch {
      // retry
    }
  }
  return false;
}

async function publishCodexTemp(
  packet: IdeContextPacket,
  deps: SendIdeContextDeps,
  fs: TempFs,
): Promise<
  | {
      ok: true;
      finalPath: string;
      renew: typeof renewLeaseAtomic;
      now: () => number;
      leaseMs: number;
      owner: LeaseSidecar["owner"];
      sessionId: string;
    }
  | { ok: false; warning: string }
> {
  const publish = deps.publishTemp ?? publishIdeContextTemp;
  const renew = deps.renewLease ?? renewLeaseAtomic;
  const dir = deps.tempDir ?? "/tmp/agent-ide-context";
  const now = deps.now ?? (() => Date.now());
  const leaseMs = deps.leaseMs ?? 60_000;
  const owner = deps.owner ?? "markdownWorkshop";
  const sessionId = deps.sessionId ?? `mw-${now()}`;
  const published = await publish(fs, {
    dir,
    basename: `ide-context-${sessionId}.json`,
    bytes: Buffer.from(serializeJson(packet)),
    owner,
    sessionId,
    now,
    leaseMs,
  });
  if ("skipped" in published && published.skipped) {
    return { ok: false, warning: published.warning };
  }
  return {
    ok: true,
    finalPath: "finalPath" in published ? published.finalPath : "",
    renew,
    now,
    leaseMs,
    owner,
    sessionId,
  };
}

async function sendCodex(
  packet: IdeContextPacket,
  md: string,
  deps: SendIdeContextDeps,
): Promise<SendIdeContextResult> {
  const fs = deps.tempFs;
  if (!fs) {
    deps.inform?.("IDE context copied (Codex temp FS unavailable)");
    return { markdown: md, opened: "clipboard", softFailWarning: "no temp fs" };
  }
  const published = await publishCodexTemp(packet, deps, fs);
  if (!published.ok) {
    deps.inform?.(published.warning);
    return {
      markdown: md,
      opened: "clipboard",
      softFailWarning: published.warning,
    };
  }
  const attached = await attachCodexWithRetries(deps, fs, {
    finalPath: published.finalPath,
    renew: published.renew,
    now: published.now,
    leaseMs: published.leaseMs,
    owner: published.owner,
    sessionId: published.sessionId,
  });
  if (!attached) {
    deps.inform?.("IDE context copied; Codex attach failed");
    return {
      markdown: md,
      opened: "clipboard",
      softFailWarning: "codex attach failed",
    };
  }
  return { markdown: md, opened: "codex" };
}

/**
 * Send IDE Context: clipboard always gets markdown; agent open only via forced /
 * sole-agent auto / explicit picker. Never silent-guess Claude vs Codex.
 */
export async function sendIdeContext(
  packet: IdeContextPacket,
  deps: SendIdeContextDeps,
): Promise<SendIdeContextResult> {
  const md = renderMarkdown(packet);
  await deps.clipboardWrite(md);

  const target = await pickSendTarget(deps);
  if (target === "cancelled") {
    return { markdown: md, opened: "cancelled" };
  }
  if (target === "clipboard") {
    deps.inform?.("IDE context copied");
    return { markdown: md, opened: "clipboard" };
  }
  if (target === "claudeCode") {
    return sendClaude(md, deps);
  }
  return sendCodex(packet, md, deps);
}
