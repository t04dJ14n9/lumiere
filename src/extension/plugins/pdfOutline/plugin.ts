import * as vscode from 'vscode';
import type { PluginDefinition, PdfServices } from '../services';
import manifest from './manifest';
import { registerOutlineView } from './outline-view';

/** The PDF Outline view in the Explorer, and the viewer bar's outline button. */
export const pdfOutlinePlugin: PluginDefinition<PdfServices> = {
  manifest,
  activate(scope) {
    const panels = scope.get('panels');
    scope.acquire(registerOutlineView(panels), 'treeView');
    scope.acquire(panels.handle('toggleOutline', () => vscode.commands.executeCommand('vscodeEmbedPdf.toggleOutline')), 'message handler');
  },
};
