/** Shared Send IDE Context target resolution — never silent-guess Claude vs Codex. */

export type IdeContextTargetSetting =
  "auto" | "claudeCode" | "codex" | "clipboard" | "cursor" | "chat";

export type IdeContextSendResolution =
  "claudeCode" | "codex" | "clipboard" | "picker";

export interface IdeContextSendEnvironment {
  /** Registered command ids. */
  commands: ReadonlySet<string>;
}

export const IDE_CONTEXT_AGENT_COMMANDS = {
  claudeCodeOpen: "claude-vscode.editor.open",
  codexOpen: "chatgpt.openSidebar",
  codexAddFile: "chatgpt.addFileToThread",
} as const;

function hasClaude(commands: ReadonlySet<string>): boolean {
  return commands.has(IDE_CONTEXT_AGENT_COMMANDS.claudeCodeOpen);
}

function hasCodex(commands: ReadonlySet<string>): boolean {
  return (
    commands.has(IDE_CONTEXT_AGENT_COMMANDS.codexOpen) &&
    commands.has(IDE_CONTEXT_AGENT_COMMANDS.codexAddFile)
  );
}

/**
 * Pure resolution for Send IDE Context.
 * Copy never calls this. When both Claude and Codex are available under `auto`, returns `picker`.
 */
export function resolveIdeContextSendTarget(
  setting: IdeContextTargetSetting,
  environment: IdeContextSendEnvironment,
): IdeContextSendResolution {
  const { commands } = environment;
  const claude = hasClaude(commands);
  const codex = hasCodex(commands);

  if (setting === "claudeCode") return claude ? "claudeCode" : "clipboard";
  if (setting === "codex") return codex ? "codex" : "clipboard";
  if (setting === "clipboard" || setting === "cursor" || setting === "chat") {
    return "clipboard";
  }

  // auto
  if (claude && codex) return "picker";
  if (claude && !codex) return "claudeCode";
  if (codex && !claude) return "codex";
  return "clipboard";
}
