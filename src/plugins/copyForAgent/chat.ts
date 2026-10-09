import type { AgentEnvironment } from "../../shared/runtime";

/** Where Ask Agent about Selection put the passage. */
export type ChatTarget =
  | "chat"
  | "chatWithClipboard"
  | "claudeCode"
  | "codex"
  | "clipboard";

export type { AgentEnvironment };

type Execute = (id: string, ...args: unknown[]) => Promise<unknown>;

export const AGENT_COMMANDS = {
  cursorChat: "composer.newAgentChat",
  chatOpen: "workbench.action.chat.open",
  claudeCodeOpen: "claude-vscode.editor.open",
  codexOpen: "chatgpt.openSidebar",
  codexAddFile: "chatgpt.addFileToThread",
} as const;

export interface AgentChatOptions {
  /** Without it (other hosts, tests) VS Code's chat is tried blind, as before. */
  environment?: AgentEnvironment;
  /** Saves the passage as a file Codex can attach; returns its URI. */
  writeScratchFile?(text: string): Promise<string>;
  /**
   * Codex drops a file added before its view has loaded, and adds the same
   * file only once, so the attachment is repeated after these delays.
   */
  codexRetryDelaysMs?: readonly number[];
}

const CODEX_RETRY_DELAYS_MS = [1000, 2000, 4000];

async function tryCommand(execute: Execute, id: string, ...args: unknown[]) {
  try {
    await execute(id, ...args);
    return true;
  } catch {
    return false;
  }
}

/**
 * Opens an agent chat with the passage. Cursor's agent chat cannot be
 * prefilled by an extension, so it opens with the passage on the clipboard to
 * paste. VS Code's chat takes a prefilled, still-editable question, but only
 * when an extension answers there: VS Code registers its chat command even
 * with no chat extension installed. Next come the Claude Code extension, whose
 * new conversation takes the passage as its prompt (its `@path#a-b` mention
 * attaches those lines), and Codex, which gets the passage attached as a file.
 * With no chat at all, the passage is only copied.
 */
export async function openAgentChat(
  execute: Execute,
  copy: (text: string) => Promise<void>,
  payload: string,
  options: AgentChatOptions = {},
): Promise<ChatTarget> {
  const { environment } = options;
  // Without an environment, try each command blind (as before).
  const has = (id: string) => environment?.commands.has(id) ?? true;
  if (
    has(AGENT_COMMANDS.cursorChat) &&
    (await tryCommand(execute, AGENT_COMMANDS.cursorChat))
  ) {
    await copy(payload);
    return "chatWithClipboard";
  }
  if (chatAnswers(environment) && (await openChat(execute, payload))) {
    return "chat";
  }
  if (
    has(AGENT_COMMANDS.claudeCodeOpen) &&
    // (viewColumn, initialPrompt): a new conversation with the prompt typed in, not sent.
    (await tryCommand(
      execute,
      AGENT_COMMANDS.claudeCodeOpen,
      undefined,
      `${payload}\n\n`,
    ))
  ) {
    return "claudeCode";
  }
  await copy(payload);
  if (
    environment &&
    (await attachToCodex(execute, environment, payload, options))
  ) {
    return "codex";
  }
  return "clipboard";
}

/** VS Code registers its chat command even with no chat extension to answer. */
function chatAnswers(environment: AgentEnvironment | undefined): boolean {
  return (
    !environment ||
    (environment.hasChatParticipant &&
      !environment.chatDisabled &&
      environment.commands.has(AGENT_COMMANDS.chatOpen))
  );
}

async function openChat(execute: Execute, payload: string): Promise<boolean> {
  // A chat view that is not open yet drops the query, so open it first.
  if (!(await tryCommand(execute, AGENT_COMMANDS.chatOpen))) {
    return false;
  }
  await execute(AGENT_COMMANDS.chatOpen, {
    query: `${payload}\n\n`,
    isPartialQuery: true,
  });
  return true;
}

/**
 * Codex takes no prefilled text from an extension (its `?prompt=` link leaves
 * the composer empty), but it attaches files: the passage goes in as one.
 */
async function attachToCodex(
  execute: Execute,
  environment: AgentEnvironment,
  payload: string,
  options: AgentChatOptions,
): Promise<boolean> {
  if (
    !options.writeScratchFile ||
    !environment.commands.has(AGENT_COMMANDS.codexAddFile) ||
    !environment.commands.has(AGENT_COMMANDS.codexOpen)
  ) {
    return false;
  }
  const file = await options.writeScratchFile(payload);
  if (
    !(await tryCommand(execute, AGENT_COMMANDS.codexOpen)) ||
    !(await tryCommand(execute, AGENT_COMMANDS.codexAddFile, file))
  ) {
    return false;
  }
  void (async () => {
    for (const ms of options.codexRetryDelaysMs ?? CODEX_RETRY_DELAYS_MS) {
      await new Promise((resolve) => setTimeout(resolve, ms));
      await tryCommand(execute, AGENT_COMMANDS.codexAddFile, file);
    }
  })();
  return true;
}
