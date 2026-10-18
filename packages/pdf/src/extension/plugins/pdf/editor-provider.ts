import type * as vscode from "vscode";
import type { Digests } from "@workshop/platform";
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
    private readonly digests: Digests,
  ) {}

  openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
    return { uri, dispose: () => undefined };
  }

  resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
  ): void {
    const uri = document.uri.with({ fragment: "" });
    const panel = new PdfPanel(uri, webviewPanel, {
      extensionUri: this.extensionUri,
      digests: this.digests,
      toolbar: this.panels.viewerToolbar(),
      agentLinks: this.panels.handles("copyLinkForAgent"),
      settings: this.preferences.settings(uri),
      position: this.preferences.position(uri),
      savePosition: (position) => this.preferences.save(uri, position),
      route: (target, message) => this.panels.route(target, message),
    });
    this.panels.add(panel);
    // A link such as `paper.pdf#page=3` opens at that page.
    const location = parseLocationFragment(document.uri.fragment);
    if (location) {
      panel.goTo(location);
    }
  }
}
