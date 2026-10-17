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
  const markdown = renderMarkdown(packet);
  await deps.clipboardWrite(markdown);
  const target = await chooseTarget(deps);
  if (target === "cancelled") {
    return { markdown, opened: "cancelled" };
  }
  if (target === "clipboard") {
    deps.inform?.("IDE context copied");
    return { markdown, opened: "clipboard" };
  }
  if (target === "claudeCode") {
    await deps.executeCommand(
      AGENT_COMMANDS.claudeCodeOpen,
      undefined,
      `${markdown}\n\n`,
    );
    return { markdown, opened: "claudeCode" };
  }
  return { markdown, ...(await attachToCodex(packet, deps)) };
}

type Target = "claudeCode" | "codex" | "clipboard" | "cancelled";

/** The setting's target, or the user's pick when it asks. */
async function chooseTarget(deps: SendIdeContextDeps): Promise<Target> {
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
  return pick ?? "cancelled";
}

/** A leased temp file's owner, session and timing. */
interface Lease {
  dir: string;
  now: () => number;
  leaseMs: number;
  owner: LeaseSidecar["owner"];
  sessionId: string;
}

/**
 * Codex takes files, not text: publish the packet as a leased temp file and
 * attach it. Falls back to the clipboard (already written) with a warning.
 */
async function attachToCodex(
  packet: IdeContextPacket,
  deps: SendIdeContextDeps,
): Promise<Omit<SendIdeContextResult, "markdown">> {
  const fs = deps.tempFs;
  if (!fs) {
    return { opened: "clipboard", softFailWarning: "no temp fs" };
  }
  const now = deps.now ?? (() => Date.now());
  const lease: Lease = {
    dir: deps.tempDir ?? "/tmp/agent-ide-context",
    now,
    leaseMs: deps.leaseMs ?? 60_000,
    owner: deps.owner ?? "pdfWorkshop",
    sessionId: deps.sessionId ?? `pdf-${now()}`,
  };
  const publish = deps.publishTemp ?? publishIdeContextTemp;
  const published = await publish(fs, {
    ...lease,
    basename: `ide-context-${lease.sessionId}.json`,
    bytes: Buffer.from(serializeJson(packet)),
  });
  if ("skipped" in published && published.skipped) {
    deps.inform?.(published.warning);
    return { opened: "clipboard", softFailWarning: published.warning };
  }
  const finalPath = "finalPath" in published ? published.finalPath : "";
  return (await attachWithRetries(fs, finalPath, lease, deps))
    ? { opened: "codex" }
    : { opened: "clipboard", softFailWarning: "codex attach failed" };
}

/** Open Codex and attach the file, retrying after the given delays. */
async function attachWithRetries(
  fs: TempFs,
  finalPath: string,
  lease: Lease,
  deps: SendIdeContextDeps,
): Promise<boolean> {
  const renew = deps.renewLease ?? renewLeaseAtomic;
  const delays = deps.codexRetryDelaysMs ?? [0, 10];
  for (const [attempt, delay] of delays.entries()) {
    if (attempt > 0 && delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    try {
      // Delay + open first on retry; renew immediately before add-file so the
      // lease cannot expire during prep work after renewal.
      await deps.executeCommand(AGENT_COMMANDS.codexOpen);
      if (attempt > 0) {
        await renew(fs, leasePathFor(finalPath), {
          leaseUntil: new Date(lease.now() + lease.leaseMs).toISOString(),
          owner: lease.owner,
          sessionId: lease.sessionId,
        });
      }
      await deps.executeCommand(
        AGENT_COMMANDS.codexAddFile,
        pathToFileUriString(finalPath),
      );
      return true;
    } catch {
      /* retry */
    }
  }
  return false;
}
