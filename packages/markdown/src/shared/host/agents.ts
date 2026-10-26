import type { IdeContextHostApis, TempFs } from "@workshop/agents/ide-context";

/** The `lumiere.markdown.copyLinkForAgent.target` setting. */
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
  /** The editor's tabs and diagnostics for an IDE context packet; absent where the editor has none. */
  ideContextHost?(): IdeContextHostApis;
  /** Where IDE context packets go for agents that read files (Codex); absent where none can. */
  readonly ideContextTemp?: IdeContextTemp;
}

/** The shared temp folder agents read IDE context packets from. */
export interface IdeContextTemp {
  readonly fs: TempFs;
  readonly dir: string;
  /** A published packet's `file:` URI, for the agent's add-file command. */
  fileUri(path: string): string;
}
