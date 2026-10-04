import { createHash } from 'node:crypto';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { agentText } from '../shared/agent-text';
import { parseViewerMessage, type HostMessage, type OutlineItem } from '../shared/messages';
import type { PdfLocation } from '../shared/pdf-location';
import type { PdfSelection } from '../shared/selection';
import { viewerHtml } from './webview-html';

/** Let a file write settle before reloading the PDF. */
const RELOAD_DELAY_MS = 150;

/**
 * One open PDF editor. It sends the file to its viewer, reloads the viewer
 * when the file changes on disk, and keeps what the viewer reports: the
 * outline and the current selection.
 */
export class PdfPanel implements vscode.Disposable {
  /** The outline, or `undefined` while the viewer is still reading it. */
  outline: OutlineItem[] | undefined;
  selection: PdfSelection | undefined;

  private readonly changed = new vscode.EventEmitter<void>();
  /** Fires when the outline or the selection changes. */
  readonly onDidChange = this.changed.event;

  private sha256: string | undefined;
  private loaded = false;
  /** Counts loads, so a slow read never replaces a newer file. */
  private loadGeneration = 0;
  private pendingLocation: PdfLocation | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    readonly uri: vscode.Uri,
    readonly webviewPanel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
  ) {
    const webview = webviewPanel.webview;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'webview')],
    };
    this.disposables.push(
      this.changed,
      webview.onDidReceiveMessage(message => this.receive(message)),
      this.reloadWhenFileChanges(),
    );
    webview.html = viewerHtml(webview, extensionUri);
  }

  /** Show a page (and box). Held until the viewer has the PDF. */
  goTo(location: PdfLocation): void {
    if (this.loaded) this.post({ type: 'goTo', location });
    else this.pendingLocation = location;
  }

  /** Put the selection on the clipboard in the form agents read. */
  async copyForAgent(): Promise<boolean> {
    if (!this.selection || !this.sha256) {
      void vscode.window.showWarningMessage('Select text or a region in the PDF to copy it for an agent.');
      return false;
    }
    const source = { path: displayPath(this.uri), sha256: this.sha256 };
    await vscode.env.clipboard.writeText(agentText(this.selection, source));
    void vscode.window.showInformationMessage('Selection copied for agent.');
    return true;
  }

  dispose(): void {
    for (const disposable of this.disposables) disposable.dispose();
  }

  private async receive(raw: unknown): Promise<void> {
    const message = parseViewerMessage(raw);
    switch (message?.type) {
      case 'ready':
        await this.load();
        break;
      case 'outline':
        this.outline = message.items;
        this.changed.fire();
        break;
      case 'selection':
        this.selection = message.selection ?? undefined;
        this.changed.fire();
        break;
      case 'copyForAgent':
        await this.copyForAgent();
        break;
      case 'openExternal':
        await vscode.env.openExternal(vscode.Uri.parse(message.url));
        break;
      case 'error':
        void vscode.window.showErrorMessage(`PDF viewer: ${message.message}`);
        break;
    }
  }

  /** Send the file to the viewer, which (re)opens it. */
  private async load(): Promise<void> {
    const generation = ++this.loadGeneration;
    this.loaded = false;
    this.outline = undefined;
    this.selection = undefined;
    this.changed.fire();
    let bytes: Uint8Array;
    try {
      bytes = await vscode.workspace.fs.readFile(this.uri);
    } catch (error) {
      void vscode.window.showErrorMessage(`Could not read ${displayPath(this.uri)}: ${String(error)}`);
      return;
    }
    if (generation !== this.loadGeneration) return;
    this.sha256 = createHash('sha256').update(bytes).digest('hex');
    this.post({ type: 'load', data: standaloneBuffer(bytes) });
    this.loaded = true;
    if (this.pendingLocation) {
      this.post({ type: 'goTo', location: this.pendingLocation });
      this.pendingLocation = undefined;
    }
  }

  private reloadWhenFileChanges(): vscode.Disposable {
    if (this.uri.scheme !== 'file') return new vscode.Disposable(() => undefined);
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.file(path.dirname(this.uri.fsPath)), path.basename(this.uri.fsPath)),
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reload = (): void => {
      clearTimeout(timer);
      timer = setTimeout(() => void this.load(), RELOAD_DELAY_MS);
    };
    watcher.onDidChange(reload);
    watcher.onDidCreate(reload);
    return new vscode.Disposable(() => {
      clearTimeout(timer);
      watcher.dispose();
    });
  }

  private post(message: HostMessage): void {
    void this.webviewPanel.webview.postMessage(message);
  }
}

/** The path agents should use: workspace-relative when possible. */
export function displayPath(uri: vscode.Uri): string {
  return vscode.workspace.asRelativePath(uri, false).replaceAll('\\', '/');
}

/** The bytes as an ArrayBuffer of their own, which the webview can take over. */
function standaloneBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength && bytes.buffer instanceof ArrayBuffer
    ? bytes.buffer
    : bytes.slice().buffer as ArrayBuffer;
}
