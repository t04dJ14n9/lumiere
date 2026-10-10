import * as vscode from "vscode";
import {
  parseReadingPosition,
  type ReadingPosition,
} from "../../../shared/reading-position";
import {
  parseViewSettings,
  resolveSmoothScrolling,
  type ViewSettings,
} from "../../../shared/view-settings";
import type { PdfPanels } from "./panels";

const SECTION = "vscodeEmbedPdf.view";

/** Defaults for new views; saved positions are read once, independently by each panel. */
export class ViewPreferences implements vscode.Disposable {
  private readonly subscription: vscode.Disposable;

  constructor(
    private readonly state: vscode.Memento,
    panels: PdfPanels,
  ) {
    this.subscription = vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        !event.affectsConfiguration(SECTION) &&
        !event.affectsConfiguration("editor.smoothScrolling")
      )
        return;
      for (const panel of panels.all)
        panel.setViewSettings(this.settings(panel.uri));
    });
  }

  settings(uri: vscode.Uri): ViewSettings {
    const config = vscode.workspace.getConfiguration(SECTION, uri);
    const settings = parseViewSettings({
      defaultZoom: config.get("defaultZoom"),
      pageLayout: config.get("pageLayout"),
      scrollMode: config.get("scrollMode"),
      scrollDirection: config.get("scrollDirection"),
      smoothScrolling: config.get("smoothScrolling"),
    });
    settings.smoothScrolling = resolveSmoothScrolling(
      settings.smoothScrolling,
      vscode.workspace.getConfiguration("editor", uri).get("smoothScrolling"),
      false,
    );
    return settings;
  }

  position(uri: vscode.Uri): ReadingPosition | undefined {
    return parseReadingPosition(this.state.get(this.key(uri)));
  }

  save(uri: vscode.Uri, position: ReadingPosition): void {
    // Detached storage work has an error sink; open panels never follow this saved value.
    void this.state
      .update(this.key(uri), position)
      .then(undefined, (error) =>
        console.error("Could not save PDF view", error),
      );
  }

  dispose(): void {
    this.subscription.dispose();
  }

  private key(uri: vscode.Uri): string {
    return `vscodeEmbedPdf.readingPosition:${uri.toString()}`;
  }
}
