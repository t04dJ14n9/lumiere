import type { AgentEnvironment, CopyLinkTarget } from "../../shared/runtime";

/** Where Copy Link for Agent put the passage. */
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
  /** Without it (other hosts, tests) Cursor's and VS Code's chats are tried blind. */
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
 * Opens an agent chat with the passage, but only one known for sure. No
 * extension can tell which agent the user works in (VS Code shows no
 * context-key values, the Claude Code and Codex sidebars leave no trace in its
 * tab API, and the note has the focus anyway), so `auto` opens the editor's
 * own chat only when it is the only agent installed: Cursor's agent chat
 * (which an extension cannot prefill, so it opens with the passage on the
 * clipboard) or VS Code's chat when an extension answers there (prefilled,
 * still editable). With Claude Code or Codex installed as well, it does not
 * guess: the passage is only copied, to paste into the user's agent. The
 * `copyLinkForAgent.target` setting forces one agent: Claude Code, whose new
 * conversation takes the passage as its prompt (its `@path#a-b` mention
 * attaches those lines), or Codex, which gets the passage attached as a file.
 */
export async function openAgentChat(
  execute: Execute,
  copy: (text: string) => Promise<void>,
  payload: string,
  options: AgentChatOptions = {},
): Promise<ChatTarget> {
  const { environment } = options;
  const target = environment?.target ?? "auto";
  const routes: Record<CopyLinkTarget, Route[]> = {
    // Without an environment (other hosts), the editor's chats are tried blind.
    auto: hasOtherAgent(environment) ? [] : [openCursor, openChat],
    cursor: [openCursor],
    chat: [openChat],
    claudeCode: [openClaudeCode],
    codex: [attachToCodex],
    clipboard: [],
  };
  const context = { execute, copy, payload, options };
  for (const route of routes[target]) {
    const opened = await route(context);
    if (opened) {
      return opened;
    }
  }
  await copy(payload);
  return "clipboard";
}

interface RouteContext {
  execute: Execute;
  copy: (text: string) => Promise<void>;
  payload: string;
  options: AgentChatOptions;
}

/** Opens one agent chat with the passage; returns how, or undefined if it could not. */
type Route = (context: RouteContext) => Promise<ChatTarget | undefined>;

async function openCursor({
  execute,
  copy,
  payload,
  options,
}: RouteContext): Promise<ChatTarget | undefined> {
  if (
    options.environment?.commands.has(AGENT_COMMANDS.cursorChat) === false ||
    !(await tryCommand(execute, AGENT_COMMANDS.cursorChat))
  ) {
    return undefined;
  }
  await copy(payload);
  return "chatWithClipboard";
}

/** Claude Code or Codex is installed: the user may be working in it. */
function hasOtherAgent(environment: AgentEnvironment | undefined): boolean {
  if (!environment) {
    return false;
  }
  const { commands } = environment;
  return (
    environment.agentExtensions.size > 0 ||
    commands.has(AGENT_COMMANDS.claudeCodeOpen) ||
    commands.has(AGENT_COMMANDS.codexOpen)
  );
}

async function openClaudeCode({
  execute,
  payload,
  options,
}: RouteContext): Promise<ChatTarget | undefined> {
  const opened =
    options.environment?.commands.has(AGENT_COMMANDS.claudeCodeOpen) !==
      false &&
    // (viewColumn, initialPrompt): a new conversation with the prompt typed in, not sent.
    (await tryCommand(
      execute,
      AGENT_COMMANDS.claudeCodeOpen,
      undefined,
      `${payload}\n\n`,
    ));
  return opened ? "claudeCode" : undefined;
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

async function openChat({
  execute,
  payload,
  options,
}: RouteContext): Promise<ChatTarget | undefined> {
  // A chat view that is not open yet drops the query, so open it first.
  if (
    !chatAnswers(options.environment) ||
    !(await tryCommand(execute, AGENT_COMMANDS.chatOpen))
  ) {
    return undefined;
  }
  await execute(AGENT_COMMANDS.chatOpen, {
    query: `${payload}\n\n`,
    isPartialQuery: true,
  });
  return "chat";
}

/**
 * Codex takes no prefilled text from an extension (its `?prompt=` link leaves
 * the composer empty), but it attaches files: the passage goes in as one.
 */
async function attachToCodex({
  execute,
  copy,
  payload,
  options,
}: RouteContext): Promise<ChatTarget | undefined> {
  const { environment, writeScratchFile } = options;
  if (
    !environment ||
    !writeScratchFile ||
    !environment.commands.has(AGENT_COMMANDS.codexAddFile) ||
    !environment.commands.has(AGENT_COMMANDS.codexOpen)
  ) {
    return undefined;
  }
  // Codex shows the file, not its text: keep the passage on the clipboard too.
  await copy(payload);
  const file = await writeScratchFile(payload);
  if (
    !(await tryCommand(execute, AGENT_COMMANDS.codexOpen)) ||
    !(await tryCommand(execute, AGENT_COMMANDS.codexAddFile, file))
  ) {
    return undefined;
  }
  void (async () => {
    for (const ms of options.codexRetryDelaysMs ?? CODEX_RETRY_DELAYS_MS) {
      await new Promise((resolve) => setTimeout(resolve, ms));
      await tryCommand(execute, AGENT_COMMANDS.codexAddFile, file);
    }
  })();
  return "codex";
}
