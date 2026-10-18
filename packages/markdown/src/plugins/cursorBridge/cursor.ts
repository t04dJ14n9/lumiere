/** Cursor AI command ids used by cursorBridge (best-effort; not a public API). */
export const CURSOR_COMMANDS = {
  chat: "aichat.newchataction",
  chatFallback: "composer.newAgentChat",
  edit: "aipopup.action.modal.generate",
} as const;

export type CursorChatTarget =
  "chat" | "chatFallback" | "clipboard" | "unavailable";
export type CursorEditTarget = "edit" | undefined;

type Execute = (id: string, ...args: unknown[]) => Promise<unknown>;

/** 0-based VS Code positions; converted to Monaco 1-based for Cursor Edit. */
export interface CursorEditTargetRange {
  readonly start: { line: number; character: number };
  readonly end: { line: number; character: number };
}

export interface CursorEditInvocation {
  /** vscode.Uri (or Uri-like) for the mirrored note; required for reliable Edit. */
  readonly uri: unknown;
  readonly range: CursorEditTargetRange;
}

/** Same predicate as document warm and reclaim: Cursor’s app name. */
export function isCursorHost(appName: string | undefined): boolean {
  return typeof appName === "string" && /cursor/i.test(appName);
}

async function tryCommand(
  execute: Execute,
  id: string,
  ...args: unknown[]
): Promise<boolean> {
  try {
    await execute(id, ...args);
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
    if (selectionText) {
      await copy(selectionText);
    }
    return "chatFallback";
  }
  if (!selectionText) {
    return "unavailable";
  }
  await copy(selectionText);
  return "clipboard";
}

/**
 * Opens Cursor inline Edit on the mirrored native selection.
 *
 * Cursor’s `aipopup.action.modal.generate` resolves the editor via
 * `getActiveCodeEditor()` and silently returns when that is null. Passing
 * `overrideUri` / `overrideRange` (Monaco 1-based) forces Cursor to open the
 * mirrored note even when focus has not settled after handoff.
 */
export async function openCursorEdit(
  execute: Execute,
  commands?: ReadonlySet<string>,
  target?: CursorEditInvocation,
): Promise<CursorEditTarget> {
  if (commands?.has(CURSOR_COMMANDS.edit) === false) {
    return undefined;
  }
  const args = target ? [editArgs(target)] : [];
  if (!(await tryCommand(execute, CURSOR_COMMANDS.edit, ...args))) {
    return undefined;
  }
  return "edit";
}

/** Whether the Cursor Edit command id is present in a discovered command set. */
export function cursorEditAvailable(
  commands: ReadonlySet<string> | undefined,
): boolean {
  return commands?.has(CURSOR_COMMANDS.edit) !== false;
}

function editArgs(target: CursorEditInvocation): {
  overrideUri: unknown;
  overrideRange: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  };
  invocationType: "new";
} {
  const { start, end } = target.range;
  return {
    overrideUri: target.uri,
    overrideRange: {
      startLineNumber: start.line + 1,
      startColumn: start.character + 1,
      endLineNumber: end.line + 1,
      endColumn: end.character + 1,
    },
    invocationType: "new",
  };
}
