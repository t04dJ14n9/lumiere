import * as vscode from 'vscode';
import { titleActionsInMenu } from '../../../shared/toolbar-settings';
import type { PluginDefinition, PdfServices } from '../services';
import { TOOLBAR_COMMAND_IDS } from '../pdf/registered-commands';
import manifest from './manifest';
import { selectToolbarMode } from './mode-picker';
import { ToolbarPreferences } from './preferences';
import { StatusBar } from './status-bar';

/**
 * Where the viewer's controls are: the status bar entries for the active PDF
 * (in the `chrome` mode), the viewer's own slim or floating bar, the
 * setting's live updates, and the command that picks the mode. The editor
 * title actions are contributed in package.json and follow the same setting.
 */
export const pdfToolbarPlugin: PluginDefinition<PdfServices> = {
  manifest,
  activate(scope) {
    const panels = scope.get('panels');
    const preferences = scope.acquire(new ToolbarPreferences(scope.get('context').globalState), 'preferences');
    // Where the title bar would only add the viewer's buttons to its "…" menu,
    // they would repeat that menu's own page and zoom entries: leave them out.
    void vscode.commands.executeCommand('setContext', 'pdfWorkshop.titleActionsInMenu', titleActionsInMenu(vscode.env.appName));
    // Lifecycle work: the reset is returned, so teardown awaits it.
    scope.acquire({ dispose: () => vscode.commands.executeCommand('setContext', 'pdfWorkshop.titleActionsInMenu', false) }, 'context key');
    const statusBar = scope.acquire(new StatusBar(panels), 'statusBar');
    scope.acquire(panels.provideViewerToolbar(() => preferences.settings), 'viewer settings');
    scope.acquire(panels.handle('floatingDock', (_panel, message) => preferences.setDock(message.dock)), 'message handler');
    const follow = (): void => {
      const settings = preferences.settings;
      // Every open viewer follows, the one the bar was dragged in included.
      for (const panel of panels.all) panel.setToolbar(settings);
      statusBar.update();
    };
    scope.acquire(preferences.onDidChange(follow), 'listener');
    scope.acquire(vscode.commands.registerCommand(TOOLBAR_COMMAND_IDS.selectToolbarMode, selectToolbarMode), 'command');
    // Viewers opened before this plugin started got the default layout.
    follow();
  },
};
