import { mkdir, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import type { AgentHost, CopyLinkTarget } from "../../shared/host";

/** Extensions that bring an agent chat of their own besides the editor's. */
const AGENT_EXTENSIONS = ["anthropic.claude-code", "openai.chatgpt"];

/** Copy Link for Agent: which agent chats exist, and files to attach. */
export function createAgentHost(): AgentHost {
  return {
    appName: vscode.env.appName,
    async environment() {
      return {
        target: vscode.workspace
          .getConfiguration("markdownWorkshop")
          .get<CopyLinkTarget>("copyLinkForAgent.target", "auto"),
        agentExtensions: new Set(
          AGENT_EXTENSIONS.filter((id) => vscode.extensions.getExtension(id)),
        ),
        commands: new Set(await vscode.commands.getCommands(true)),
        hasChatParticipant: vscode.extensions.all.some(hasChatParticipants),
        chatDisabled: vscode.workspace
          .getConfiguration("chat")
          .get<boolean>("disableAIFeatures", false),
      };
    },
    async writeScratchFile(name, text) {
      const folder = path.join(os.tmpdir(), "markdown-workshop-agent");
      await mkdir(folder, { recursive: true, mode: 0o700 });
      const file = path.join(folder, path.basename(name));
      await writeFile(file, text, { mode: 0o600 });
      return vscode.Uri.file(file).toString();
    },
  };
}

function hasChatParticipants(extension: vscode.Extension<unknown>): boolean {
  const participants = (
    extension.packageJSON as
      { contributes?: { chatParticipants?: unknown } } | undefined
  )?.contributes?.chatParticipants;
  return Array.isArray(participants) && participants.length > 0;
}
