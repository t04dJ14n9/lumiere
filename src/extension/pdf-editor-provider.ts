import type * as vscode from 'vscode';
import { parseLocationFragment } from '../shared/pdf-location';
import { PdfPanel } from './pdf-panel';
import type { PdfPanels } from './pdf-panels';
import type { RegionImages } from './region-images';
import type { ToolbarPreferences } from './toolbar';

/** Opens `*.pdf` files in the viewer. PDFs are read-only here. */
export class PdfEditorProvider implements vscode.CustomReadonlyEditorProvider {
  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly panels: PdfPanels,
    private readonly regionImages: RegionImages,
    private readonly toolbar: ToolbarPreferences,
  ) {}

  openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
    return { uri, dispose: () => undefined };
  }

  resolveCustomEditor(document: vscode.CustomDocument, webviewPanel: vscode.WebviewPanel): void {
    const panel = new PdfPanel(document.uri.with({ fragment: '' }), webviewPanel, this.extensionUri, this.regionImages, this.toolbar);
    this.panels.add(panel);
    // A link such as `paper.pdf#page=3` opens at that page.
    const location = parseLocationFragment(document.uri.fragment);
    if (location) panel.goTo(location);
  }
}
