/**
 * Agent PDF Viewer: opens PDFs in an EmbedPDF-based viewer, shows their
 * outline in the Explorer, and copies selections in a form agents can locate.
 *
 *   pdf-editor-provider  opens *.pdf files as PdfPanels
 *   pdf-panel            one open editor and its viewer
 *   pdf-panels           all open editors and the active one
 *   region-images        PNG snapshots of selected regions, for agents
 *   outline-view         the "PDF Outline" tree in the Explorer
 *   commands             Copy for Agent, Open PDF at Location
 */
import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { registerOutlineView } from './outline-view';
import { PdfEditorProvider } from './pdf-editor-provider';
import { PdfPanels, VIEW_TYPE } from './pdf-panels';
import { RegionImages } from './region-images';

export function activate(context: vscode.ExtensionContext): void {
  const panels = new PdfPanels();
  const regionImages = new RegionImages(vscode.Uri.joinPath(context.storageUri ?? context.globalStorageUri, 'regions'));
  context.subscriptions.push(
    panels,
    vscode.window.registerCustomEditorProvider(VIEW_TYPE, new PdfEditorProvider(context.extensionUri, panels, regionImages), {
      // Keep the rendered pages when the tab is hidden; reopening a PDF is slow.
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: true,
    }),
    registerOutlineView(panels),
    registerCommands(panels),
  );
}

export function deactivate(): void {}
