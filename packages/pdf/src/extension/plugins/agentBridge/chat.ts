import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import {
  AGENT_COMMANDS,
  AGENT_EXTENSIONS,
  agentTarget,
  type AgentTarget,
  type AgentTargetSetting,
} from "../../../shared/agent-target";

/**
 * Codex drops a file added before its view has loaded and adds the same file
 * only once, so attachments are repeated after these delays.
 */
const CODEX_RETRY_DELAYS_MS = [1000, 2000, 4000];

/**
 * Open the agent chat with the selection (already on the clipboard): typed
 * into Cursor's, VS Code's or Claude Code's chat, ready for a question, with a
 * region's snapshot attached (Claude Code reads it from the path in the
 * text); or attached to Codex as files. With no agent known for sure (see
 * `agentTarget`), nothing opens: the clipboard is the handoff. Returns where
 * the selection went.
 */
export async function openAgentChat(
  text: string,
  image: vscode.Uri | undefined,
  source?: vscode.Uri,
): Promise<AgentTarget> {
  const commands = new Set(await vscode.commands.getCommands(true));
  const setting = vscode.workspace
    .getConfiguration("lumiere.pdf")
    .get<AgentTargetSetting>("copyLinkForAgent.target", "auto");
  const target = agentTarget(setting, {
    appName: vscode.env.appName,
    commands,
    hasChatParticipant: vscode.extensions.all.some((extension) =>
      hasChatParticipants(extension.packageJSON),
    ),
    chatDisabled: vscode.workspace
      .getConfiguration("chat")
      .get<boolean>("disableAIFeatures", false),
    agentExtensions: new Set(
      AGENT_EXTENSIONS.filter((id) => vscode.extensions.getExtension(id)),
    ),
  });
  switch (target) {
    case "cursor":
      // Cursor answers VS Code's chat command with a new chat holding the text.
      await vscode.commands.executeCommand(AGENT_COMMANDS.chatOpen, {
        query: `${text}\n\n`,
      });
      if (image) {
        await vscode.commands.executeCommand(
          AGENT_COMMANDS.cursorAddFiles,
          image,
          { useExactResource: true },
        );
      }
      break;
    case "chat":
      await vscode.commands.executeCommand(AGENT_COMMANDS.chatOpen, {
        query: `${text}\n\n`,
        // Leave the query in the input instead of sending it.
        isPartialQuery: true,
        ...(image ? { attachFiles: [image] } : {}),
      });
      break;
    case "claudeCode":
      // (viewColumn, initialPrompt): a new conversation with the prompt typed in, not sent.
      await vscode.commands.executeCommand(
        AGENT_COMMANDS.claudeCodeOpen,
        undefined,
        `${text}\n\n`,
      );
      break;
    case "codex":
      await attachToCodex(text, image, source);
      break;
    case "clipboard":
      break;
  }
  return target;
}

/**
 * Codex takes no prefilled text from an extension (its `?prompt=` link leaves
 * the composer empty in 26.51007), but it attaches files: the selection goes
 * in as a Markdown file outside the workspace, plus a region's snapshot.
 */
async function attachToCodex(
  text: string,
  image: vscode.Uri | undefined,
  source: vscode.Uri | undefined,
): Promise<void> {
  const folder = path.join(os.tmpdir(), "agent-pdf-viewer");
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const name = source ? path.basename(source.path, ".pdf") : "pdf";
  const file = path.join(
    folder,
    `${name}-selection-${createHash("sha256").update(text).digest("hex").slice(0, 8)}.md`,
  );
  await writeFile(file, `${text}\n`, { mode: 0o600 });
  const files = [vscode.Uri.file(file), ...(image ? [image] : [])];
  const attach = async () => {
    for (const uri of files) {
      await vscode.commands.executeCommand(AGENT_COMMANDS.codexAddFile, uri);
    }
  };
  await vscode.commands.executeCommand(AGENT_COMMANDS.codexOpen);
  await attach();
  void (async () => {
    for (const ms of CODEX_RETRY_DELAYS_MS) {
      await new Promise((resolve) => setTimeout(resolve, ms));
      await attach().catch(() => undefined);
    }
  })();
}

function hasChatParticipants(packageJson: unknown): boolean {
  const contributes = (
    packageJson as { contributes?: { chatParticipants?: unknown } } | undefined
  )?.contributes;
  return (
    Array.isArray(contributes?.chatParticipants) &&
    contributes.chatParticipants.length > 0
  );
}
