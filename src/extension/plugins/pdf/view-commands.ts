import * as vscode from 'vscode';
import { parsePageInput, parseZoomInput, zoomLabel, type ViewerAction } from '../../../shared/view-state';
import { ZOOM_STEPS } from '../../../shared/zoom-steps';
import type { PdfPanels } from './panels';

/**
 * The commands behind the viewer's controls, wherever they are: the editor
 * title actions, the status bar, keybindings, the command palette and the
 * viewer's own toolbar. Each acts on the PDF in the active editor.
 */
export function registerViewCommands(panels: PdfPanels): vscode.Disposable {
  const act = (action: ViewerAction) => (): void => panels.active?.act(action);
  return vscode.Disposable.from(
    vscode.commands.registerCommand('vscodeEmbedPdf.previousPage', act({ action: 'previousPage' })),
    vscode.commands.registerCommand('vscodeEmbedPdf.nextPage', act({ action: 'nextPage' })),
    vscode.commands.registerCommand('vscodeEmbedPdf.zoomIn', act({ action: 'zoomIn' })),
    vscode.commands.registerCommand('vscodeEmbedPdf.zoomOut', act({ action: 'zoomOut' })),
    vscode.commands.registerCommand('vscodeEmbedPdf.fitWidth', act({ action: 'fitWidth' })),
    vscode.commands.registerCommand('vscodeEmbedPdf.fitPage', act({ action: 'fitPage' })),
    vscode.commands.registerCommand('vscodeEmbedPdf.find', act({ action: 'find' })),
    vscode.commands.registerCommand('vscodeEmbedPdf.selectTextTool', act({ action: 'setTool', tool: 'text' })),
    vscode.commands.registerCommand('vscodeEmbedPdf.selectRegionTool', act({ action: 'setTool', tool: 'region' })),
    vscode.commands.registerCommand('vscodeEmbedPdf.goToPage', (page?: unknown) => goToPage(panels, page)),
    vscode.commands.registerCommand('vscodeEmbedPdf.selectZoom', (percent?: unknown) => selectZoom(panels, percent)),
  );
}

/**
 * Open a page of the active PDF: the one given (by another extension or a
 * keybinding's `args`), else ask for it.
 */
async function goToPage(panels: PdfPanels, page: unknown): Promise<void> {
  const panel = panels.active;
  const view = panel?.view;
  if (!panel || !view) return;
  if (typeof page === 'number' && Number.isSafeInteger(page) && page >= 1) {
    panel.act({ action: 'goToPage', page });
    return;
  }
  const text = await vscode.window.showInputBox({
    title: 'Go to Page',
    prompt: `Type a page number between 1 and ${view.pageCount}`,
    value: String(view.page),
    valueSelection: [0, String(view.page).length],
    validateInput: value => parsePageInput(value, view.pageCount) === undefined ? `Type a page number between 1 and ${view.pageCount}` : undefined,
  });
  const target = text === undefined ? undefined : parsePageInput(text, view.pageCount);
  // The editor may have closed while the box was open.
  if (target !== undefined && panels.active === panel) panel.act({ action: 'goToPage', page: target });
}

type ZoomItem = vscode.QuickPickItem & { action: ViewerAction };

/** `current` beside the item that is in effect. */
const current = (on: boolean): { description?: string } => (on ? { description: 'current' } : {});

/** Zoom levels offered in the picker, in percent. */
const PICKER_ZOOMS = ZOOM_STEPS.filter(step => step >= 0.5).map(step => Math.round(step * 100));

/**
 * Pick a zoom for the active PDF: fit width, fit page, a level, or one
 * typed in (such as 140). With a level given, set it without asking.
 */
async function selectZoom(panels: PdfPanels, percent: unknown): Promise<void> {
  const panel = panels.active;
  const view = panel?.view;
  if (!panel || !view) return;
  if (typeof percent === 'number' && Number.isFinite(percent) && percent > 0) {
    panel.act({ action: 'setZoom', percent });
    return;
  }
  const fixed: ZoomItem[] = [
    { label: '$(arrow-both) Fit Width', ...current(view.fit === 'width'), action: { action: 'fitWidth' } },
    { label: '$(screen-full) Fit Page', ...current(view.fit === 'page'), action: { action: 'fitPage' } },
    { label: '', kind: vscode.QuickPickItemKind.Separator, action: { action: 'fitPage' } },
    ...PICKER_ZOOMS.map((level): ZoomItem => ({
      label: `${level}%`,
      ...current(!view.fit && level === view.zoomPercent),
      action: { action: 'setZoom', percent: level },
    })),
  ];
  const picker = vscode.window.createQuickPick<ZoomItem>();
  picker.title = `Zoom (now ${zoomLabel(view)})`;
  picker.placeholder = 'Pick a zoom, or type one such as 140';
  picker.items = fixed;
  picker.matchOnDescription = false;
  picker.onDidChangeValue(value => {
    const typed = parseZoomInput(value);
    // Offer the typed level first; the fixed entries still filter as usual.
    picker.items = typed === undefined ? fixed : [
      { label: `${Math.round(typed * 10) / 10}%`, description: 'typed', alwaysShow: true, action: { action: 'setZoom', percent: typed } },
      ...fixed,
    ];
  });
  const choice = await new Promise<ZoomItem | undefined>(resolve => {
    picker.onDidAccept(() => {
      resolve(picker.selectedItems[0]);
      picker.hide();
    });
    picker.onDidHide(() => resolve(undefined));
    picker.show();
  });
  picker.dispose();
  if (choice && panels.active === panel) panel.act(choice.action);
}
