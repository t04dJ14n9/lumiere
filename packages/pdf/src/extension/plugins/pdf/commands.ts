import * as path from 'node:path';
import * as vscode from 'vscode';
import { extractPdfLink, parseLocationFragment, parsePdfLocation } from '../../../shared/pdf-location';
import { resolvePdfCandidates } from '../../../shared/pdf-target-resolution';
import { VIEW_TYPE, type PdfPanels } from './panels';
import { OPEN_LOCATION_COMMAND_ID } from './registered-commands';

/** PDF: Open Location, which makes the viewer a navigation target for links and other extensions. */
export function registerOpenLocation(panels: PdfPanels): vscode.Disposable {
  let generation = 0;
  let pending: vscode.CancellationTokenSource | undefined;
  // Native editor resolution cannot be cancelled once dispatched. Serialize it
  // so an older slow open can never finish after the newest queued destination.
  let opening: Promise<void> = Promise.resolve();
  const dispatch = (run: () => Promise<boolean>): Promise<boolean> => {
    const result = opening.then(run);
    opening = result.then(() => undefined, () => undefined);
    return result;
  };
  const command = vscode.commands.registerCommand(OPEN_LOCATION_COMMAND_ID, async (target?: unknown, location?: unknown) => {
    pending?.cancel();
    pending?.dispose();
    const cancellation = new vscode.CancellationTokenSource();
    pending = cancellation;
    const request = ++generation;
    try {
      return await openLocation(panels, target, location, () => request === generation, cancellation.token, dispatch);
    } finally {
      if (pending === cancellation) pending = undefined;
      cancellation.dispose();
    }
  });
  return new vscode.Disposable(() => {
    generation++;
    pending?.cancel();
    pending?.dispose();
    command.dispose();
  });
}

/**
 * Open a PDF at a page (and box). With no arguments, ask for a link such as
 * one an agent printed: `papers/paper.pdf#page=3&viewrect=72,83,134,21`.
 * Other extensions can pass a URI and a location:
 *
 *     vscode.commands.executeCommand('pdfWorkshop.openLocation', uri, { page: 3 })
 */
async function openLocation(panels: PdfPanels, target: unknown, location: unknown, current: () => boolean, token: vscode.CancellationToken, dispatch: (run: () => Promise<boolean>) => Promise<boolean>): Promise<boolean> {
  const link = target ?? await vscode.window.showInputBox({
    title: 'Open PDF at Location',
    prompt: 'A PDF path or link, optionally with #page=… and &viewrect=…, or a Source line copied for an agent',
    placeHolder: 'papers/paper.pdf#page=3&viewrect=72,83,134,21',
  }, token);
  if (link === undefined || !current()) return false;
  const resolved = await resolvePdfUri(link, current, token);
  if (!current() || resolved.status === 'cancelled') return false;
  if (resolved.status !== 'found') {
    void vscode.window.showWarningMessage(`No readable PDF file found at ${String(link)}`);
    return false;
  }
  const uri = resolved.target;
  const destination = location !== undefined ? parsePdfLocation(location) : parseLocationFragment(uri.fragment);
  if ((location !== undefined || uri.fragment.length > 0) && !destination) {
    void vscode.window.showWarningMessage('The PDF location is invalid. Use a positive whole page number, optionally with a valid viewrect.');
    return false;
  }
  const file = uri.with({ fragment: '' });
  return dispatch(async () => {
    if (!current()) return false;
    await vscode.commands.executeCommand('vscode.openWith', file, VIEW_TYPE);
    if (!current()) return false;
    const panel = await panels.waitFor(file);
    if (!panel || !current()) return false;
    if (destination) panel.goTo(destination);
    return true;
  });
}

/**
 * A URI, a `file:` URL, an absolute path, or a path inside a workspace
 * folder; given as text, it can also be wrapped in a Markdown link.
 */
async function resolvePdfUri(target: unknown, current: () => boolean, token: vscode.CancellationToken): Promise<{ status: 'found'; target: vscode.Uri } | { status: 'missing' | 'cancelled' }> {
  let candidates: vscode.Uri[];
  if (target instanceof vscode.Uri) candidates = [target];
  else {
    if (typeof target !== 'string' || !target.trim()) return { status: 'missing' };
    const text = extractPdfLink(target);
    try {
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) candidates = [vscode.Uri.parse(text)];
      else {
        const hash = text.indexOf('#');
        const file = hash < 0 ? text : text.slice(0, hash);
        const fragment = hash < 0 ? '' : text.slice(hash + 1);
        candidates = (path.isAbsolute(file)
          ? [vscode.Uri.file(file)]
          : (vscode.workspace.workspaceFolders ?? []).map(folder => vscode.Uri.joinPath(folder.uri, file)))
          .map(uri => uri.with({ fragment }));
      }
    } catch {
      return { status: 'missing' };
    }
  }
  return resolvePdfCandidates(candidates, uri => uri.toString(), async uri => {
    if (!current() || !/\.pdf$/iu.test(uri.path)) return false;
    try {
      const stat = await vscode.workspace.fs.stat(uri.with({ fragment: '' }));
      return (stat.type & vscode.FileType.File) !== 0 && (stat.type & vscode.FileType.Directory) === 0;
    } catch {
      return false;
    }
  }, async matches => {
    if (!current()) return undefined;
    const choice = await vscode.window.showQuickPick(matches.map(uri => ({ label: path.basename(uri.path), description: uri.fsPath, uri })), {
      title: 'Choose the PDF to open',
      placeHolder: 'This relative path exists in more than one workspace folder',
    }, token);
    return choice?.uri;
  });
}
