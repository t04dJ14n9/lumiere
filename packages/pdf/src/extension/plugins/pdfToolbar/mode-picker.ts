import * as vscode from 'vscode';
import { parseToolbarMode, type ToolbarMode } from '../../../shared/toolbar-settings';
import type { PdfSettings } from '../../settings';
import { SECTION } from './preferences';

const MODE_CHOICES: { mode: ToolbarMode; label: string; detail: string }[] = [
  { mode: 'chrome', label: '$(layout-statusbar) Editor Title Bar and Status Bar', detail: 'VS Code\'s own controls: buttons next to the tab, page and zoom in the status bar' },
  { mode: 'slim', label: '$(layout-panel-off) Slim Bar in the Viewer', detail: 'A slim bar along the top of the viewer' },
  { mode: 'floating', label: '$(layout-centered) Floating Bar in the Viewer', detail: 'A bar over the pages that fades while you read; drag its grip to another edge' },
  { mode: 'none', label: '$(eye-closed) None', detail: 'Keyboard shortcuts, the right-click menu and the command palette only' },
];

/** Ask where the controls go, and save the answer in the setting the Settings editor shows. */
export async function selectToolbarMode(settings: PdfSettings): Promise<void> {
  const current = parseToolbarMode(vscode.workspace.getConfiguration(SECTION).get('mode'));
  const choice = await vscode.window.showQuickPick(
    MODE_CHOICES.map(choice => ({ ...choice, ...(choice.mode === current ? { description: 'current' } : {}) })),
    { title: 'PDF Viewer Controls', placeHolder: 'Where should the page, zoom and find controls be?' },
  );
  if (choice && choice.mode !== current) {
    await settings.update(`${SECTION}.mode`, choice.mode);
  }
}
