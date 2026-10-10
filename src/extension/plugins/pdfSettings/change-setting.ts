import * as vscode from 'vscode';
import {
  formatValue,
  numberProblem,
  settingEntries,
  type SchemaProperty,
  type SettingEntry,
} from '../../../shared/setting-schema';
import { updateSetting } from '../../settings';

type Item = vscode.QuickPickItem & { entry?: SettingEntry };

/** The extension's settings, from its own manifest. */
export function contributedSettings(extensionId: string): SettingEntry[] {
  const manifest = vscode.extensions.getExtension(extensionId)?.packageJSON as
    | { contributes?: { configuration?: { properties?: Record<string, SchemaProperty> } | { properties?: Record<string, SchemaProperty> }[] } }
    | undefined;
  const configuration = manifest?.contributes?.configuration;
  const sections = Array.isArray(configuration) ? configuration : configuration ? [configuration] : [];
  return sections.flatMap(section => settingEntries(section.properties ?? {}));
}

/**
 * PDF: Change Setting…: every contributed setting in one list, grouped, with its
 * current value; picking one edits it by its type. Values are read and written
 * under the keys of the Settings editor (see `updateSetting`).
 */
export async function changeSetting(extensionId: string): Promise<void> {
  const entries = contributedSettings(extensionId);
  const config = vscode.workspace.getConfiguration();
  const items: Item[] = [];
  let group: string | undefined;
  for (const entry of entries.slice().sort((a, b) => a.group.localeCompare(b.group))) {
    if (entry.group !== group) {
      group = entry.group;
      items.push({ label: group, kind: vscode.QuickPickItemKind.Separator });
    }
    items.push({
      label: entry.title,
      description: formatValue(config.get(entry.key), entry.kind),
      detail: entry.description,
      entry,
    });
  }
  const picked = await vscode.window.showQuickPick(items, {
    title: 'PDF: Change Setting',
    placeHolder: 'Choose a setting to change',
    matchOnDescription: true,
    matchOnDetail: true,
  });
  if (picked?.entry) await edit(picked.entry);
}

async function edit(entry: SettingEntry): Promise<void> {
  const config = vscode.workspace.getConfiguration();
  const current: unknown = config.get(entry.key);
  switch (entry.kind) {
    case 'boolean':
      await updateSetting(entry.key, current !== true);
      return;
    case 'tristate': {
      const choices: (vscode.QuickPickItem & { value: boolean | null })[] = [
        { label: 'On', value: true },
        { label: 'Off', value: false },
        { label: 'Follow the editor', value: null },
      ].map(choice => (choice.value === (current ?? null) ? { ...choice, description: 'current' } : choice));
      const choice = await vscode.window.showQuickPick(choices, { title: entry.title, placeHolder: entry.description });
      if (choice) await updateSetting(entry.key, choice.value);
      return;
    }
    case 'enum': {
      const choices: vscode.QuickPickItem[] = entry.choices.map(choice => ({
        label: choice.value,
        ...(choice.description ? { detail: choice.description } : {}),
        ...(choice.value === current ? { description: 'current' } : {}),
      }));
      const choice = await vscode.window.showQuickPick(choices, { title: entry.title, placeHolder: entry.description });
      if (choice) await updateSetting(entry.key, choice.label);
      return;
    }
    case 'number': {
      const text = await vscode.window.showInputBox({
        title: entry.title,
        prompt: entry.description,
        value: String(current ?? entry.defaultValue ?? ''),
        validateInput: value => numberProblem(value, entry),
      });
      if (text !== undefined) await updateSetting(entry.key, Number(text));
      return;
    }
    case 'string': {
      const text = await vscode.window.showInputBox({ title: entry.title, prompt: entry.description, value: String(current ?? '') });
      if (text !== undefined) await updateSetting(entry.key, text);
      return;
    }
    case 'complex':
      // No simple editor for it: the Settings editor shows it with its description.
      await vscode.commands.executeCommand('workbench.action.openSettings', entry.key);
      return;
  }
}
