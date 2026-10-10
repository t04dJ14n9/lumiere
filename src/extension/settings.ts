import * as vscode from 'vscode';
import { type SchemaProperty, writeProblem } from '../shared/setting-schema';
import { settingTarget } from '../shared/settings-target';

/** The id of this extension, as VS Code knows it. */
export const EXTENSION_ID = 't04dj14n9.vscode-embedpdf';

/** The settings this extension contributes, from its manifest, by key. */
export function contributedProperties(extensionId: string = EXTENSION_ID): Record<string, SchemaProperty> {
  const manifest = vscode.extensions.getExtension(extensionId)?.packageJSON as
    | { contributes?: { configuration?: unknown } }
    | undefined;
  const configuration = manifest?.contributes?.configuration;
  const sections = (Array.isArray(configuration) ? configuration : configuration ? [configuration] : []) as {
    properties?: Record<string, SchemaProperty>;
  }[];
  return Object.assign({}, ...sections.map(section => section.properties ?? {})) as Record<string, SchemaProperty>;
}

/**
 * Save a setting of this extension under the key the Settings editor uses
 * (`vscodeEmbedPdf.view.smoothScrolling`, …): in the workspace if it is set
 * there, else in the user settings. Commands keep no state of their own, so
 * the Settings editor and the commands always agree.
 *
 * Nothing is taken on trust: the key must be one this extension contributes and
 * the value must fit its schema (type, enum, minimum, maximum), or this throws
 * and nothing is written. The target is chosen from the setting as it is now,
 * right before the write.
 */
export async function updateSetting(key: string, value: unknown): Promise<void> {
  const problem = writeProblem(contributedProperties(), key, value);
  if (problem) throw new Error(problem);
  const config = vscode.workspace.getConfiguration();
  const target = settingTarget(config.inspect(key)) === 'workspace'
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;
  await config.update(key, value, target);
}
