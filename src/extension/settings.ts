import * as vscode from 'vscode';
import { settingTarget } from '../shared/settings-target';

/**
 * Save a setting of this extension under the key the Settings editor uses
 * (`vscodeEmbedPdf.view.smoothScrolling`, …): in the workspace if it is set
 * there, else in the user settings. Commands keep no state of their own, so
 * the Settings editor and the commands always agree.
 */
export async function updateSetting(key: string, value: unknown): Promise<void> {
  const config = vscode.workspace.getConfiguration();
  const target = settingTarget(config.inspect(key)) === 'workspace'
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;
  await config.update(key, value, target);
}
