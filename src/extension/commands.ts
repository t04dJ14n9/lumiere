import * as path from 'node:path';
import * as vscode from 'vscode';
import { extractPdfLink, parseLocationFragment, type PdfLocation } from '../shared/pdf-location';
import { VIEW_TYPE, type PdfPanels } from './pdf-panels';

export function registerCommands(panels: PdfPanels): vscode.Disposable {
  return vscode.Disposable.from(
    vscode.commands.registerCommand('vscodeEmbedPdf.copyLinkForAgent', () => panels.active?.copyLinkForAgent()),
    vscode.commands.registerCommand('vscodeEmbedPdf.goToOutlineItem', (page: unknown, top?: unknown) => {
      if (typeof page === 'number') panels.active?.goTo({ page }, typeof top === 'number' ? top : undefined);
    }),
    vscode.commands.registerCommand('vscodeEmbedPdf.openLocation', (target?: unknown, location?: unknown) =>
      openLocation(panels, target, location)),
  );
}

/**
 * Open a PDF at a page (and box). With no arguments, ask for a link such as
 * one an agent printed: `papers/paper.pdf#page=3&viewrect=72,83,134,21`.
 * Other extensions can pass a URI and a location:
 *
 *     vscode.commands.executeCommand('vscodeEmbedPdf.openLocation', uri, { page: 3 })
 */
async function openLocation(panels: PdfPanels, target: unknown, location: unknown): Promise<boolean> {
  const link = target ?? await vscode.window.showInputBox({
    title: 'Open PDF at Location',
    prompt: 'A PDF path or link, optionally with #page=… and &viewrect=…, or a Source line copied for an agent',
    placeHolder: 'papers/paper.pdf#page=3&viewrect=72,83,134,21',
  });
  const uri = await resolvePdfUri(link);
  if (!uri) {
    if (link !== undefined) void vscode.window.showWarningMessage(`No PDF found at ${String(link)}`);
    return false;
  }
  const destination = asLocation(location) ?? parseLocationFragment(uri.fragment);
  const file = uri.with({ fragment: '' });
  await vscode.commands.executeCommand('vscode.openWith', file, VIEW_TYPE);
  const panel = await panels.waitFor(file);
  if (!panel) return false;
  if (destination) panel.goTo(destination);
  return true;
}

/**
 * A URI, a `file:` URL, an absolute path, or a path inside a workspace
 * folder; given as text, it can also be wrapped in a Markdown link.
 */
async function resolvePdfUri(target: unknown): Promise<vscode.Uri | undefined> {
  if (target instanceof vscode.Uri) return target;
  if (typeof target !== 'string' || !target.trim()) return undefined;
  const text = extractPdfLink(target);
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return vscode.Uri.parse(text);
  const hash = text.indexOf('#');
  const file = hash < 0 ? text : text.slice(0, hash);
  const fragment = hash < 0 ? '' : text.slice(hash + 1);
  const candidates = path.isAbsolute(file)
    ? [vscode.Uri.file(file)]
    : (vscode.workspace.workspaceFolders ?? []).map(folder => vscode.Uri.joinPath(folder.uri, file));
  for (const candidate of candidates) {
    try {
      await vscode.workspace.fs.stat(candidate);
      return candidate.with({ fragment });
    } catch {
      // Not in this folder.
    }
  }
  return undefined;
}

function asLocation(value: unknown): PdfLocation | undefined {
  if (typeof value === 'string') return parseLocationFragment(value);
  if (typeof value !== 'object' || value === null) return undefined;
  const { page, viewRect } = value as Partial<PdfLocation>;
  if (typeof page !== 'number' || !Number.isSafeInteger(page) || page < 1) return undefined;
  return viewRect ? { page, viewRect } : { page };
}
