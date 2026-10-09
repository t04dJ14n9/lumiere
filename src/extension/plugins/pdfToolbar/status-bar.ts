import * as vscode from 'vscode';
import { parseToolbarMode, showStatusBarButtons } from '../../../shared/toolbar-settings';
import { pageLabel, zoomLabel } from '../../../shared/view-state';
import type { PdfPanels } from '../pdf/panels';
import { SECTION } from './preferences';

/** A shortcut as this platform writes it: `key('Ctrl+G', '⌃G')`. */
function key(other: string, mac: string): string {
  return process.platform === 'darwin' ? mac : other;
}

type Item = { id: string; name: string; text: string; tooltip: string; command: string; priority: number; button?: true };

/**
 * Status bar entries, from left to right: previous page, "Page 4 / 15"
 * (click to go to a page), next page, zoom out, "Fit Width (164%)" (click
 * to pick a zoom), zoom in, find. The buttons show only when
 * `toolbar.statusBarButtons` asks for them.
 */
const ITEMS: Item[] = [
  { id: 'previousPage', name: 'PDF Previous Page', text: '$(chevron-up)', tooltip: `Previous Page (${key('Alt+PageUp', '⌥PageUp')})`, command: 'vscodeEmbedPdf.previousPage', priority: 106, button: true },
  { id: 'page', name: 'PDF Page', text: '', tooltip: `Go to Page… (${key('Ctrl+G', '⌃G')})`, command: 'vscodeEmbedPdf.goToPage', priority: 105 },
  { id: 'nextPage', name: 'PDF Next Page', text: '$(chevron-down)', tooltip: `Next Page (${key('Alt+PageDown', '⌥PageDown')})`, command: 'vscodeEmbedPdf.nextPage', priority: 104, button: true },
  { id: 'zoomOut', name: 'PDF Zoom Out', text: '$(zoom-out)', tooltip: `Zoom Out (${key('Ctrl+-', '⌘-')})`, command: 'vscodeEmbedPdf.zoomOut', priority: 103, button: true },
  { id: 'zoom', name: 'PDF Zoom', text: '', tooltip: 'Pick a Zoom…', command: 'vscodeEmbedPdf.selectZoom', priority: 102 },
  { id: 'zoomIn', name: 'PDF Zoom In', text: '$(zoom-in)', tooltip: `Zoom In (${key('Ctrl+=', '⌘=')})`, command: 'vscodeEmbedPdf.zoomIn', priority: 101, button: true },
  { id: 'find', name: 'PDF Find', text: '$(search)', tooltip: `Find in PDF (${key('Ctrl+F', '⌘F')})`, command: 'vscodeEmbedPdf.find', priority: 100, button: true },
];

export class StatusBar implements vscode.Disposable {
  private readonly items = new Map<string, vscode.StatusBarItem>();
  private readonly subscription: vscode.Disposable;

  constructor(private readonly panels: PdfPanels) {
    for (const item of ITEMS) {
      const entry = vscode.window.createStatusBarItem(`vscodeEmbedPdf.${item.id}`, vscode.StatusBarAlignment.Right, item.priority);
      entry.name = item.name;
      entry.text = item.text;
      entry.tooltip = item.tooltip;
      entry.command = item.command;
      this.items.set(item.id, entry);
    }
    this.subscription = panels.onDidChange(() => this.update());
    this.update();
  }

  update(): void {
    const view = this.panels.active?.view;
    const configuration = vscode.workspace.getConfiguration(SECTION);
    const shown = view !== undefined && parseToolbarMode(configuration.get('mode')) === 'chrome';
    const buttons = shown && showStatusBarButtons(configuration.get('statusBarButtons'), vscode.env.appName);
    for (const item of ITEMS) {
      const entry = this.items.get(item.id)!;
      if (!shown || (item.button && !buttons)) {
        entry.hide();
        continue;
      }
      if (item.id === 'page') entry.text = pageLabel(view);
      if (item.id === 'zoom') entry.text = zoomLabel(view);
      if (item.id === 'previousPage') entry.command = view.page > 1 ? item.command : undefined;
      if (item.id === 'nextPage') entry.command = view.page < view.pageCount ? item.command : undefined;
      entry.show();
    }
  }

  dispose(): void {
    this.subscription.dispose();
    for (const entry of this.items.values()) entry.dispose();
  }
}

