import * as vscode from 'vscode';
import type { PluginDefinition, PdfServices } from '../services';
import { registerOpenLocation } from './commands';
import { PdfEditorProvider } from './editor-provider';
import manifest from './manifest';
import { PdfPanels, VIEW_TYPE } from './panels';
import { registerViewCommands } from './view-commands';

/**
 * The viewer itself: opens `*.pdf` files, tracks the open editors, and
 * takes the page, zoom, find and Open Location commands.
 */
export const pdfPlugin: PluginDefinition<PdfServices> = {
  manifest,
  activate(scope) {
    const { extensionUri } = scope.get('context');
    const panels = scope.acquire(new PdfPanels(), 'panels');
    scope.acquire(vscode.window.registerCustomEditorProvider(VIEW_TYPE, new PdfEditorProvider(extensionUri, panels), {
      // Keep the rendered pages when the tab is hidden; reopening a PDF is slow.
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: true,
    }), 'customEditor');
    scope.acquire(registerOpenLocation(panels), 'command');
    scope.acquire(registerViewCommands(panels), 'commands');
    scope.provide('panels', panels);
  },
};
