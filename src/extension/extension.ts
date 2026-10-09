/**
 * Agent PDF Viewer: opens PDFs in an EmbedPDF-based viewer, shows their
 * outline in the Explorer, and copies selections in a form agents can locate.
 *
 *   pdf-editor-provider  opens *.pdf files as PdfPanels
 *   pdf-panel            one open editor and its viewer
 *   pdf-panels           all open editors and the active one
 *   region-images        PNG snapshots of selected regions, for agents
 *   outline-view         the "PDF Outline" tree in the Explorer
 *   commands             Copy for Agent, Ask Agent, Open PDF at Location
 *   view-commands        page, zoom, find and tool commands for the active PDF
 *   toolbar              where the controls are: status bar entries, setting
 *   agent-chat           opening the agent chat with a selection
 */
import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { registerOutlineView } from './outline-view';
import { PdfEditorProvider } from './pdf-editor-provider';
import { PdfPanels, VIEW_TYPE } from './pdf-panels';
import { RegionImages, regionCacheBytes } from './region-images';
import { registerToolbar, ToolbarPreferences } from './toolbar';
import { registerViewCommands } from './view-commands';

export function activate(context: vscode.ExtensionContext): void {
  const panels = new PdfPanels();
  const toolbar = new ToolbarPreferences(context.globalState);
  const regionImages = new RegionImages(
    vscode.Uri.joinPath(context.storageUri ?? context.globalStorageUri, 'regions').fsPath,
    // Read at every save, so a changed setting applies without a reload.
    () => regionCacheBytes(vscode.workspace.getConfiguration('vscodeEmbedPdf').get('regionImageCache.maxSizeMB')),
  );
  context.subscriptions.push(
    panels,
    toolbar,
    vscode.window.registerCustomEditorProvider(VIEW_TYPE, new PdfEditorProvider(context.extensionUri, panels, regionImages, toolbar), {
      // Keep the rendered pages when the tab is hidden; reopening a PDF is slow.
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: true,
    }),
    registerOutlineView(panels),
    registerCommands(panels),
    registerViewCommands(panels),
    registerToolbar(panels, toolbar),
  );
}

export function deactivate(): void {}
