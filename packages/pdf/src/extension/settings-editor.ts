/** `vscode.commands.executeCommand`, passed in so tests need no editor. */
export type ExecuteCommand = (
  command: string,
  ...args: unknown[]
) => Thenable<unknown>;

/**
 * Open the Settings editor searching for `query`.
 *
 * Run through `runCommands`, which returns nothing. Run directly,
 * `workbench.action.openSettings` returns the Settings editor itself, and
 * the window turns that whole object into JSON to send it back to the
 * extension; in Cursor that froze the window for 15 to 75 seconds.
 * Lumière has the same helper in its host
 * (`packages/markdown/src/host/settings-editor.ts`).
 */
export async function openSettingsEditor(
  execute: ExecuteCommand,
  query: string,
): Promise<void> {
  await execute("runCommands", {
    commands: [{ command: "workbench.action.openSettings", args: query }],
  });
}
