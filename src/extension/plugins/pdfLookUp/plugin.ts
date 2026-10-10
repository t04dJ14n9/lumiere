import * as vscode from 'vscode';
import { lookUpEnabled, lookUpUrl } from '../../../shared/look-up';
import type { PdfPanel } from '../pdf/panel';
import type { PluginDefinition, PdfServices } from '../services';
import manifest from './manifest';
import { LookUpTargets } from './targets';

const SETTING = 'vscodeEmbedPdf.lookUp.enabled';
const HAS_WORD = 'vscodeEmbedPdf.lookUp.hasWord';

/**
 * macOS Look Up for PDFs (a force click on a word, or Look Up in the context
 * menu). The viewer finds the word; this plugin opens it in the Dictionary
 * app. It does nothing off macOS or with `vscodeEmbedPdf.lookUp.enabled` off,
 * and stopping the plugin turns the viewers' side off again.
 */
export const pdfLookUpPlugin: PluginDefinition<PdfServices> = {
  manifest,
  activate(scope) {
    const panels = scope.get('panels');
    const targets = new LookUpTargets<PdfPanel>();
    const enabled = (): boolean =>
      lookUpEnabled(process.platform, vscode.workspace.getConfiguration().get<boolean>(SETTING, true));
    const setContext = (hasWord: boolean): void => void vscode.commands.executeCommand('setContext', HAS_WORD, hasWord);
    const open = async (word: string | undefined): Promise<void> => {
      if (word && enabled()) await vscode.env.openExternal(vscode.Uri.parse(lookUpUrl(word), true));
    };
    const apply = (): void => {
      for (const panel of panels.all) panel.setLookUp(enabled());
      if (!enabled()) setContext(false);
    };
    apply();
    scope.acquire(panels.onDidOpen(panel => panel.setLookUp(enabled())), 'listener');
    scope.acquire(vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration(SETTING)) apply();
    }), 'listener');
    scope.acquire(panels.handle('lookUp', async (panel, message) => {
      if (!enabled()) return;
      if (message.open) await open(message.word ?? undefined);
      else {
        targets.record(panel, message.word);
        setContext(message.word !== null);
      }
    }), 'message handler');
    scope.acquire(vscode.commands.registerCommand('vscodeEmbedPdf.lookUp', () => open(targets.word(panels.active))), 'command');
    scope.acquire({
      dispose: () => {
        for (const panel of panels.all) panel.setLookUp(false);
        setContext(false);
      },
    }, 'viewer switch and context key');
  },
};
