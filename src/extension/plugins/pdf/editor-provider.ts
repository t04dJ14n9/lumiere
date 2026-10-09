import type * as vscode from 'vscode';
import { parseLocationFragment } from '../../../shared/pdf-location';
import { PdfPanel } from './panel';
import type { PdfPanels } from './panels';

/** Opens `*.pdf` files in the viewer. PDFs are read-only here. */
export class PdfEditorProvider implements vscode.CustomReadonlyEditorProvider {
  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly panels: PdfPanels,
  ) {}

  openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
    return { uri, dispose: () => undefined };
  }

  resolveCustomEditor(document: vscode.CustomDocument, webviewPanel: vscode.WebviewPanel): void {
    const panel = new PdfPanel(document.uri.with({ fragment: '' }), webviewPanel, {
      extensionUri: this.extensionUri,
      toolbar: this.panels.viewerToolbar(),
      route: (target, message) => this.panels.route(target, message),
    });
    this.panels.add(panel);
    // A link such as `paper.pdf#page=3` opens at that page.
    const location = parseLocationFragment(document.uri.fragment);
    if (location) panel.goTo(location);
  }
}
