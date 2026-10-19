import type * as vscode from "vscode";

/**
 * What `workbench.action.openSettings` takes: a search, or a search and the
 * folder whose settings to show.
 */
export type SettingsEditorArgs =
  string | { query: string; resource?: vscode.Uri };

/** `vscode.commands.executeCommand`, passed in so tests need no editor. */
export type ExecuteCommand = (
  command: string,
  ...args: unknown[]
) => Thenable<unknown>;

/**
 * Open the Settings editor at `args`.
 *
 * Run through `runCommands`, which returns nothing. Run directly,
 * `workbench.action.openSettings` returns the Settings editor itself, and
 * the window turns that whole object into JSON to send it back to the
 * extension; in Cursor that froze the window for 15 to 75 seconds.
 */
export async function openSettingsEditor(
  execute: ExecuteCommand,
  args: SettingsEditorArgs,
): Promise<void> {
  await execute("runCommands", {
    commands: [{ command: "workbench.action.openSettings", args }],
  });
}
