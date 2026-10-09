/**
 * Which agent chat Ask Agent opens. The editor's own chat comes first: Cursor's
 * (Cursor answers VS Code's chat command with a new chat) or VS Code's, when
 * an extension such as Copilot Chat serves it. Then the Claude Code extension,
 * whose new conversation takes the selection as its prompt, and Codex, which
 * takes no prefilled text but gets the selection (and a region's snapshot)
 * attached as files. Otherwise the clipboard alone.
 */
export type AgentTarget = 'cursor' | 'chat' | 'claudeCode' | 'codex' | 'clipboard';

/** The `vscodeEmbedPdf.askAgent.target` setting: `auto` or one target. */
export type AgentTargetSetting = 'auto' | AgentTarget;

export interface AgentEnvironment {
  /** The editor's name, e.g. "Visual Studio Code" or "Cursor". */
  appName: string;
  /** Every registered command. */
  commands: ReadonlySet<string>;
  /** Whether an installed extension answers in VS Code's chat. */
  hasChatParticipant: boolean;
  /** VS Code's `chat.disableAIFeatures` setting: the chat is hidden. */
  chatDisabled?: boolean;
}

export const AGENT_COMMANDS = {
  chatOpen: 'workbench.action.chat.open',
  cursorAddFiles: 'composer.addfilestocomposer',
  claudeCodeOpen: 'claude-vscode.editor.open',
  codexOpen: 'chatgpt.openSidebar',
  codexAddFile: 'chatgpt.addFileToThread',
} as const;

export function agentTarget(setting: AgentTargetSetting, environment: AgentEnvironment): AgentTarget {
  const available = (target: AgentTarget): boolean => {
    const { commands } = environment;
    switch (target) {
      case 'cursor':
        return /cursor/iu.test(environment.appName) && commands.has(AGENT_COMMANDS.chatOpen);
      case 'chat':
        return environment.hasChatParticipant && !environment.chatDisabled && commands.has(AGENT_COMMANDS.chatOpen);
      case 'claudeCode':
        return commands.has(AGENT_COMMANDS.claudeCodeOpen);
      case 'codex':
        return commands.has(AGENT_COMMANDS.codexOpen) && commands.has(AGENT_COMMANDS.codexAddFile);
      case 'clipboard':
        return true;
    }
  };
  if (setting !== 'auto') return available(setting) ? setting : 'clipboard';
  return (['cursor', 'chat', 'claudeCode', 'codex'] as const).find(available) ?? 'clipboard';
}
