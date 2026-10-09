import * as vscode from 'vscode';
import {
  parseFloatingDock,
  parseToolbarMode,
  showStatusBarButtons,
  titleActionsInMenu,
  type FloatingDock,
  type ToolbarMode,
  type ToolbarSettings,
} from '../shared/toolbar-settings';
import { pageLabel, zoomLabel } from '../shared/view-state';
import type { PdfPanels } from './pdf-panels';

const SECTION = 'vscodeEmbedPdf.toolbar';
const DOCK_KEY = 'vscodeEmbedPdf.floatingDock';

/**
 * The toolbar settings the viewers need: the mode from the settings, and
 * the floating bar's edge, which the reader picks by dragging it and which
 * is kept in the extension's global state rather than in the settings.
 */
export class ToolbarPreferences implements vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changed.event;
  private readonly subscription = vscode.workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration(SECTION)) this.changed.fire();
  });

  constructor(private readonly state: vscode.Memento) {}

  get settings(): ToolbarSettings {
    return {
      mode: parseToolbarMode(vscode.workspace.getConfiguration(SECTION).get('mode')),
      dock: parseFloatingDock(this.state.get(DOCK_KEY)),
    };
  }

  async setDock(dock: FloatingDock): Promise<void> {
    if (dock === this.settings.dock) return;
    await this.state.update(DOCK_KEY, dock);
    this.changed.fire();
  }

  dispose(): void {
    this.subscription.dispose();
    this.changed.dispose();
  }
}

/**
 * The viewer's controls in VS Code's own UI: the status bar entries for the
 * active PDF (in the `chrome` mode), the setting's live updates, and the
 * command that picks where the controls go. The editor title actions are
 * contributed in package.json and follow the same setting.
 */
export function registerToolbar(panels: PdfPanels, preferences: ToolbarPreferences): vscode.Disposable {
  // Where the title bar would only add the viewer's buttons to its "…" menu,
  // they would repeat that menu's own page and zoom entries: leave them out.
  void vscode.commands.executeCommand('setContext', 'vscodeEmbedPdf.titleActionsInMenu', titleActionsInMenu(vscode.env.appName));
  const statusBar = new StatusBar(panels);
  return vscode.Disposable.from(
    statusBar,
    // Every open viewer follows, the one the bar was dragged in included.
    preferences.onDidChange(() => {
      const settings = preferences.settings;
      for (const panel of panels.all) panel.setToolbar(settings);
      statusBar.update();
    }),
    vscode.commands.registerCommand('vscodeEmbedPdf.selectToolbarMode', selectToolbarMode),
  );
}

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

class StatusBar implements vscode.Disposable {
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

const MODE_CHOICES: { mode: ToolbarMode; label: string; detail: string }[] = [
  { mode: 'chrome', label: '$(layout-statusbar) Editor Title Bar and Status Bar', detail: 'VS Code\'s own controls: buttons next to the tab, page and zoom in the status bar' },
  { mode: 'slim', label: '$(layout-panel-off) Slim Bar in the Viewer', detail: 'A slim bar along the top of the viewer' },
  { mode: 'floating', label: '$(layout-centered) Floating Bar in the Viewer', detail: 'A bar over the pages that fades while you read; drag its grip to another edge' },
  { mode: 'none', label: '$(eye-closed) None', detail: 'Keyboard shortcuts, the right-click menu and the command palette only' },
];

/** Ask where the controls go, and save the answer in the user settings. */
async function selectToolbarMode(): Promise<void> {
  const current = parseToolbarMode(vscode.workspace.getConfiguration(SECTION).get('mode'));
  const choice = await vscode.window.showQuickPick(
    MODE_CHOICES.map(choice => ({ ...choice, description: choice.mode === current ? 'current' : undefined })),
    { title: 'PDF Viewer Controls', placeHolder: 'Where should the page, zoom and find controls be?' },
  );
  if (choice && choice.mode !== current) {
    await vscode.workspace.getConfiguration(SECTION).update('mode', choice.mode, vscode.ConfigurationTarget.Global);
  }
}
