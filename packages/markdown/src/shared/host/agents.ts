/** The `markdownWorkshop.copyLinkForAgent.target` setting. */
export type CopyLinkTarget =
  "auto" | "cursor" | "chat" | "claudeCode" | "codex" | "clipboard";

/** What the editor offers Copy Link for Agent. */
export interface AgentEnvironment {
  /** Where Copy Link for Agent sends the passage: `auto` or one agent. */
  target: CopyLinkTarget;
  /** Installed agent extensions (Claude Code, Codex), active or not. */
  agentExtensions: ReadonlySet<string>;
  /** Every registered command. */
  commands: ReadonlySet<string>;
  /** Whether an installed extension (e.g. Copilot Chat) answers in VS Code's chat. */
  hasChatParticipant: boolean;
  /** VS Code's `chat.disableAIFeatures`: the chat is hidden. */
  chatDisabled: boolean;
}

/** Agents the editor can hand a passage to. */
export interface AgentHost {
  /** The editor app, as `vscode.env.appName` names it ("Cursor", "Visual Studio Code"). */
  readonly appName: string;
  /** Registered commands and VS Code's chat state, read now. */
  environment(): Promise<AgentEnvironment>;
  /** Writes a scratch file outside the workspace (a passage to attach to an agent chat); returns its URI. */
  writeScratchFile(name: string, text: string): Promise<string>;
}
