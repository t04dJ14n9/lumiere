import * as vscode from 'vscode';
import { AGENT_COMMANDS, agentTarget, type AgentTarget, type AgentTargetSetting } from '../shared/agent-target';

/**
 * Open the agent chat with the selection (already on the clipboard): typed
 * into Cursor's or VS Code's chat, ready for a question, with a region's
 * snapshot attached; or, for agents that take no text, their chat opened
 * for a paste. Returns where the selection went.
 */
export async function openAgentChat(text: string, image: vscode.Uri | undefined): Promise<AgentTarget> {
  const commands = new Set(await vscode.commands.getCommands(true));
  const setting = vscode.workspace.getConfiguration('vscodeEmbedPdf').get<AgentTargetSetting>('copyLinkForAgent.target', 'auto');
  const target = agentTarget(setting, {
    appName: vscode.env.appName,
    commands,
    hasChatParticipant: vscode.extensions.all.some(extension => hasChatParticipants(extension.packageJSON)),
    chatDisabled: vscode.workspace.getConfiguration('chat').get<boolean>('disableAIFeatures', false),
  });
  switch (target) {
    case 'cursor':
      // Cursor answers VS Code's chat command with a new chat holding the text.
      await vscode.commands.executeCommand(AGENT_COMMANDS.chatOpen, { query: `${text}\n\n` });
      if (image) await vscode.commands.executeCommand(AGENT_COMMANDS.cursorAddFiles, image, { useExactResource: true });
      break;
    case 'chat':
      await vscode.commands.executeCommand(AGENT_COMMANDS.chatOpen, {
        query: `${text}\n\n`,
        // Leave the query in the input instead of sending it.
        isPartialQuery: true,
        ...(image ? { attachFiles: [image] } : {}),
      });
      break;
    case 'claudeCode':
      await vscode.commands.executeCommand(AGENT_COMMANDS.claudeCodeOpen);
      break;
    case 'codex':
      await vscode.commands.executeCommand(AGENT_COMMANDS.codexOpen);
      break;
    case 'clipboard':
      break;
  }
  return target;
}

function hasChatParticipants(packageJson: unknown): boolean {
  const contributes = (packageJson as { contributes?: { chatParticipants?: unknown } } | undefined)?.contributes;
  return Array.isArray(contributes?.chatParticipants) && contributes.chatParticipants.length > 0;
}
