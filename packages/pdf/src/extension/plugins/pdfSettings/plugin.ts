import * as vscode from 'vscode';
import { PAGE_LAYOUTS, SCROLL_MODES } from '../../../shared/view-options';
import { parseDefaultZoom, resolveSmoothScrolling } from '../../../shared/view-settings';
import { EXTENSION_ID, updateSetting } from '../../settings';
import type { PluginDefinition, PdfServices } from '../services';
import { changeSetting } from './change-setting';
import manifest from './manifest';
import { SETTINGS_COMMAND_IDS } from '../pdf/registered-commands';

const VIEW = 'pdfWorkshop.view';

const read = <T>(key: string, fallback: T): T => vscode.workspace.getConfiguration().get<T>(key, fallback);
const say = (text: string): void => void vscode.window.setStatusBarMessage(`PDF: ${text}`, 3_000);

type Pick<T> = vscode.QuickPickItem & { value: T };

/** Ask for one of `choices`, marking the current one; undefined when dismissed. */
async function choose<T>(title: string, choices: Pick<T>[], current: unknown): Promise<T | undefined> {
  const items = choices.map(choice => choice.value === current ? { ...choice, description: 'current' } : choice);
  return (await vscode.window.showQuickPick(items, { title }))?.value;
}

/**
 * Easy access to the settings: PDF: Open Settings, and commands for the
 * common ones. Every command reads and writes the very key the Settings
 * editor shows (see `updateSetting`) and keeps nothing of its own, so the two
 * agree at all times; the viewers follow through the configuration events.
 */
export const pdfSettingsPlugin: PluginDefinition<PdfServices> = {
  manifest,
  activate(scope) {
    const command = (id: keyof typeof SETTINGS_COMMAND_IDS, run: () => Thenable<unknown> | void): void =>
      void scope.acquire(vscode.commands.registerCommand(SETTINGS_COMMAND_IDS[id], run), 'command');

    command('openSettings', () => vscode.commands.executeCommand('workbench.action.openSettings', `@ext:${EXTENSION_ID}`));

    command('changeSetting', () => changeSetting(EXTENSION_ID));

    command('toggleSmoothScrolling', async () => {
      const on = resolveSmoothScrolling(read(`${VIEW}.smoothScrolling`, null), read('editor.smoothScrolling', false), false);
      await updateSetting(`${VIEW}.smoothScrolling`, !on);
      say(`smooth scrolling ${on ? 'off' : 'on'}`);
    });

    command('toggleKeyboardShortcuts', async () => {
      const on = read('pdfWorkshop.keyboardShortcuts', true);
      await updateSetting('pdfWorkshop.keyboardShortcuts', !on);
      say(`keyboard shortcuts ${on ? 'off' : 'on'}`);
    });

    command('setDefaultZoom', async () => {
      const current = parseDefaultZoom(read(`${VIEW}.defaultZoom`, 'fitWidth'));
      const custom = typeof current === 'number';
      const choice = await choose<string>('Default Zoom', [
        { label: 'Fit width', value: 'fitWidth' },
        { label: 'Fit page', value: 'fitPage' },
        { label: 'Actual size (100%)', value: 'actual' },
        { label: custom ? `Custom percentage… (${current}%)` : 'Custom percentage…', value: 'custom' },
      ], custom ? 'custom' : current);
      if (!choice) return;
      if (choice !== 'custom') return updateSetting(`${VIEW}.defaultZoom`, choice);
      const text = await vscode.window.showInputBox({
        title: 'Default Zoom',
        prompt: 'A percentage from 25 to 400',
        value: custom ? String(current) : '100',
        validateInput: value => Number.isFinite(Number(value)) && Number(value) >= 25 && Number(value) <= 400 ? undefined : 'Enter a number from 25 to 400',
      });
      if (text !== undefined) await updateSetting(`${VIEW}.defaultZoom`, Number(text));
    });

    command('setDefaultPageLayout', async () => {
      const choice = await choose('Default Page Layout', PAGE_LAYOUTS.map(item => ({ label: item.label, value: item.value })), read(`${VIEW}.pageLayout`, 'single'));
      if (choice) await updateSetting(`${VIEW}.pageLayout`, choice);
    });

    command('setDefaultScrollMode', async () => {
      const choice = await choose('Default Scrolling', SCROLL_MODES.map(item => ({ label: item.label, value: item.value })), read(`${VIEW}.scrollMode`, 'continuous'));
      if (choice) await updateSetting(`${VIEW}.scrollMode`, choice);
    });
  },
};
