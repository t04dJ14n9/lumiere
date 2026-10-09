/**
 * Which agent chat Ask Agent opens.
 *
 * No extension can tell which agent the user is working in: VS Code exposes
 * no context-key values (`getContextKeyInfo` lists keys without values), the
 * Claude Code and Codex sidebars leave no trace in `window.tabGroups`, neither
 * extension exports an API, and when Ask Agent runs the PDF has the focus
 * anyway. So `auto` never guesses: it opens the editor's own chat (Cursor's,
 * or VS Code's when an extension such as Copilot Chat serves it) only when
 * that is the only agent installed, and otherwise leaves the selection on the
 * clipboard for the user to paste into whichever agent they use. The
 * `vscodeEmbedPdf.askAgent.target` setting forces one agent: Claude Code (its
 * new conversation takes the selection as its prompt) or Codex (which takes no
 * prefilled text but gets the selection, and a region's snapshot, attached).
 */
export type AgentTarget = 'cursor' | 'chat' | 'claudeCode' | 'codex' | 'clipboard';

/** The `vscodeEmbedPdf.askAgent.target` setting: `auto` or one target. */
export type AgentTargetSetting = 'auto' | AgentTarget;

/** Extensions that bring their own agent chat besides the editor's. */
export const AGENT_EXTENSIONS = ['anthropic.claude-code', 'openai.chatgpt'] as const;

export interface AgentEnvironment {
  /** The editor's name, e.g. "Visual Studio Code" or "Cursor". */
  appName: string;
  /** Every registered command. */
  commands: ReadonlySet<string>;
  /** Whether an installed extension answers in VS Code's chat. */
  hasChatParticipant: boolean;
  /** VS Code's `chat.disableAIFeatures` setting: the chat is hidden. */
  chatDisabled?: boolean;
  /** Installed extensions with an agent chat of their own (`AGENT_EXTENSIONS`). */
  agentExtensions?: ReadonlySet<string>;
}

export const AGENT_COMMANDS = {
  chatOpen: 'workbench.action.chat.open',
  cursorAddFiles: 'composer.addfilestocomposer',
  claudeCodeOpen: 'claude-vscode.editor.open',
  codexOpen: 'chatgpt.openSidebar',
  codexAddFile: 'chatgpt.addFileToThread',
} as const;

export function agentTarget(setting: AgentTargetSetting, environment: AgentEnvironment): AgentTarget {
  const { commands } = environment;
  const available = (target: AgentTarget): boolean => {
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
  // Another agent is installed: the user may be in either, so do not pick.
  const otherAgent = (environment.agentExtensions?.size ?? 0) > 0
    || available('claudeCode') || commands.has(AGENT_COMMANDS.codexOpen);
  if (otherAgent) return 'clipboard';
  return (['cursor', 'chat'] as const).find(available) ?? 'clipboard';
}
