/** Where Ask Agent about Selection put the passage. */
export type ChatTarget = "chat" | "chatWithClipboard" | "clipboard";

type Execute = (id: string, ...args: unknown[]) => Promise<unknown>;

async function tryCommand(execute: Execute, id: string, ...args: unknown[]) {
  try {
    await execute(id, ...args);
    return true;
  } catch {
    return false;
  }
}

/**
 * Opens an agent chat with the passage. VS Code's chat takes a prefilled,
 * still-editable question. Cursor's agent chat cannot be prefilled by an
 * extension, so it opens with the passage on the clipboard to paste. With
 * no chat at all, the passage is only copied.
 */
export async function openAgentChat(
  execute: Execute,
  copy: (text: string) => Promise<void>,
  payload: string,
): Promise<ChatTarget> {
  if (await tryCommand(execute, "composer.newAgentChat")) {
    await copy(payload);
    return "chatWithClipboard";
  }
  const query = `${payload}\n\n`;
  if (
    await tryCommand(execute, "workbench.action.chat.open", {
      query,
      isPartialQuery: true,
    })
  ) {
    return "chat";
  }
  await copy(payload);
  return "clipboard";
}
