/** Cursor AI command ids used by cursorBridge (best-effort; not a public API). */
export const CURSOR_COMMANDS = {
  chat: "aichat.newchataction",
  chatFallback: "composer.newAgentChat",
  edit: "aipopup.action.modal.generate",
} as const;

export type CursorChatTarget = "chat" | "chatFallback" | "clipboard";
export type CursorEditTarget = "edit" | undefined;

type Execute = (id: string, ...args: unknown[]) => Promise<unknown>;

/** Same predicate as document warm and reclaim: Cursor’s app name. */
export function isCursorHost(appName: string | undefined): boolean {
  return typeof appName === "string" && /cursor/i.test(appName);
}

async function tryCommand(execute: Execute, id: string): Promise<boolean> {
  try {
    await execute(id);
    return true;
  } catch {
    return false;
  }
}

/**
 * Opens Cursor Chat after the selection is mirrored into a native text editor.
 * Prefers `aichat.newchataction`; falls back to Composer, then clipboard.
 */
export async function openCursorChat(
  execute: Execute,
  copy: (text: string) => Promise<void>,
  selectionText: string,
  commands?: ReadonlySet<string>,
): Promise<CursorChatTarget> {
  if (
    commands?.has(CURSOR_COMMANDS.chat) !== false &&
    (await tryCommand(execute, CURSOR_COMMANDS.chat))
  ) {
    return "chat";
  }
  if (
    commands?.has(CURSOR_COMMANDS.chatFallback) !== false &&
    (await tryCommand(execute, CURSOR_COMMANDS.chatFallback))
  ) {
    await copy(selectionText);
    return "chatFallback";
  }
  await copy(selectionText);
  return "clipboard";
}

/** Opens Cursor inline Edit on the mirrored native selection. */
export async function openCursorEdit(
  execute: Execute,
  commands?: ReadonlySet<string>,
): Promise<CursorEditTarget> {
  if (
    commands?.has(CURSOR_COMMANDS.edit) === false ||
    !(await tryCommand(execute, CURSOR_COMMANDS.edit))
  ) {
    return undefined;
  }
  return "edit";
}
