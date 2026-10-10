import * as vscode from 'vscode';
import type { PluginDefinition, PdfServices } from '../services';
import manifest from './manifest';

/**
 * Zen mode for PDFs: VS Code's own Zen Mode (hidden sidebar, status bar and
 * panels, full screen, the reader's `zenMode.*` settings), plus the viewer's
 * part of it. The viewers are told while it lasts, so the controls that VS
 * Code hides in zen (the editor title actions, the status bar) are a floating
 * bar instead, with an Exit zen button. Core has no way to ask "is zen on?",
 * so there are two commands, chosen by the `inZenMode` context key in menus
 * and keybindings; the viewer reports when full-screen zen ends without them
 * (Ctrl+K Z, the Command Palette).
 */
export const pdfZenPlugin: PluginDefinition<PdfServices> = {
  manifest,
  activate(scope) {
    const panels = scope.get('panels');
    let on = false;
    const show = (next: boolean): void => {
      on = next;
      for (const panel of panels.all) panel.setZen(next);
    };
    const enter = async (): Promise<void> => {
      show(true);
      try {
        await vscode.commands.executeCommand('workbench.action.toggleZenMode');
      } catch (error) {
        show(false);
        throw error;
      }
    };
    const exit = async (): Promise<void> => {
      show(false);
      await vscode.commands.executeCommand('workbench.action.exitZenMode');
    };
    scope.acquire(panels.onDidOpen(panel => panel.setZen(on)), 'listener');
    scope.acquire(panels.handle('zen', (_panel, message) => message.exit ? exit() : show(false)), 'message handler');
    scope.acquire(vscode.commands.registerCommand('vscodeEmbedPdf.enterZen', enter), 'command');
    scope.acquire(vscode.commands.registerCommand('vscodeEmbedPdf.exitZen', exit), 'command');
    scope.acquire({ dispose: () => show(false) }, 'viewer zen state');
  },
};
