import * as vscode from 'vscode';
import { lookUpEnabled, lookUpUrl } from '../../../shared/look-up';
import type { PluginDefinition, PdfServices } from '../services';
import { LOOK_UP_COMMAND_IDS } from '../pdf/registered-commands';
import manifest from './manifest';

const SETTING = 'pdfWorkshop.lookUp.enabled';

/**
 * macOS Look Up for PDFs (a force click on a word, or Look Up in the context
 * menu). The viewer finds the word; this plugin opens it in the Dictionary
 * app. It does nothing off macOS or with `pdfWorkshop.lookUp.enabled` off,
 * and stopping the plugin turns the viewers' side off again.
 */
export const pdfLookUpPlugin: PluginDefinition<PdfServices> = {
  manifest,
  activate(scope) {
    const panels = scope.get('panels');
    const enabled = (): boolean =>
      lookUpEnabled(process.platform, vscode.workspace.getConfiguration().get<boolean>(SETTING, true));
    const open = async (word: string | undefined): Promise<void> => {
      if (word && enabled()) await vscode.env.openExternal(vscode.Uri.parse(lookUpUrl(word), true));
    };
    const apply = (): void => {
      for (const panel of panels.all) panel.setLookUp(enabled());
    };
    apply();
    scope.acquire(panels.onDidOpen(panel => panel.setLookUp(enabled())), 'listener');
    scope.acquire(vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration(SETTING)) apply();
    }), 'listener');
    scope.acquire(panels.handle('lookUp', async (_panel, message) => {
      if (!enabled()) return;
      if (message.open) await open(message.word ?? undefined);
    }), 'message handler');
    scope.acquire(vscode.commands.registerCommand(LOOK_UP_COMMAND_IDS.lookUp, () => { if (enabled()) panels.active?.requestLookUp(); }), 'command');
    scope.acquire({
      dispose: () => {
        for (const panel of panels.all) panel.setLookUp(false);
      },
    }, 'viewer switch and context key');
  },
};
