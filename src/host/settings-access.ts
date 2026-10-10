import * as vscode from "vscode";
import type { SettingsAccess, SettingTarget } from "../shared/runtime";

/**
 * The Settings UI's own storage rule for commands that change a setting: the
 * workspace folder when it sets the key, the workspace when it does, else the
 * user's settings. Nothing is remembered between calls.
 */
export function createSettingsAccess(): SettingsAccess {
  const configuration = (resource?: string) =>
    vscode.workspace.getConfiguration(
      "markdownWorkbench",
      resource ? vscode.Uri.parse(resource) : undefined,
    );
  const locate = (key: string, resource?: string) => {
    const config = configuration(resource);
    const inspected = config.inspect(key);
    let target: SettingTarget = "user";
    if (inspected?.workspaceFolderValue !== undefined) {
      target = "workspaceFolder";
    } else if (inspected?.workspaceValue !== undefined) {
      target = "workspace";
    }
    return { config, target, value: config.get(key) };
  };
  const targets: Record<SettingTarget, vscode.ConfigurationTarget> = {
    workspaceFolder: vscode.ConfigurationTarget.WorkspaceFolder,
    workspace: vscode.ConfigurationTarget.Workspace,
    user: vscode.ConfigurationTarget.Global,
  };
  return {
    inspect(key, resource) {
      const { target, value } = locate(key, resource);
      return { target, value };
    },
    async update(key, value, resource) {
      const { config, target } = locate(key, resource);
      await config.update(key, value, targets[target]);
      return target;
    },
    async openUi(query) {
      await vscode.commands.executeCommand(
        "workbench.action.openSettings",
        query,
      );
    },
  };
}
