import type * as vscode from "vscode";
import { parseLocationFragment } from "../../../shared/pdf-location";
import { PdfPanel } from "./panel";
import type { PdfPanels } from "./panels";
import type { ViewPreferences } from "./view-preferences";

/** Opens `*.pdf` files in the viewer. PDFs are read-only here. */
export class PdfEditorProvider implements vscode.CustomReadonlyEditorProvider {
  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly panels: PdfPanels,
    private readonly preferences: ViewPreferences,
  ) {}

  openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
    return { uri, dispose: () => undefined };
  }

  resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
  ): void {
    const uri = document.uri.with({ fragment: "" });
    const panel: PdfPanel = new PdfPanel(uri, webviewPanel, {
      extensionUri: this.extensionUri,
      toolbar: this.panels.viewerToolbar(),
      settings: this.preferences.settings(uri),
      position: this.preferences.position(uri),
      savePosition: (position) => this.preferences.save(uri, position),
      // Messages arrive only after the page loads, once `panel` is set.
      route: (message) => this.panels.route(panel, message),
    });
    this.panels.add(panel);
    // A link such as `paper.pdf#page=3` opens at that page.
    const location = parseLocationFragment(document.uri.fragment);
    if (location) {
      panel.goTo(location);
    }
  }
}
