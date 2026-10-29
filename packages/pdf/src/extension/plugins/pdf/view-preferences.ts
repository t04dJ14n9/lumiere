import type * as vscode from "vscode";
import type { PdfState } from "../../../shared/host";
import type { ReadingPosition } from "../../../shared/reading-position";
import type { ViewSettings } from "../../../shared/view-settings";
import type { PdfViewerPanel } from "../../../host/viewer/panel";
import { PdfViewPreferences } from "../../../host/viewer/preferences";
import { vscodePdfConfiguration } from "./configuration";

/**
 * The view preferences (`PdfViewPreferences`) over VS Code's settings and
 * the extension's global state, by VS Code `Uri`.
 */
export class ViewPreferences implements vscode.Disposable {
  private readonly preferences: PdfViewPreferences;

  constructor(
    state: vscode.Memento,
    panels: { readonly all: readonly PdfViewerPanel[] },
  ) {
    this.preferences = new PdfViewPreferences(
      vscodePdfConfiguration,
      mementoState(state),
      panels,
    );
  }

  settings(uri: vscode.Uri): ViewSettings {
    return this.preferences.settings(uri.toString());
  }

  position(uri: vscode.Uri): ReadingPosition | undefined {
    return this.preferences.position(uri.toString());
  }

  save(uri: vscode.Uri, position: ReadingPosition): void {
    this.preferences.save(uri.toString(), position);
  }

  dispose(): void {
    this.preferences.dispose();
  }
}

function mementoState(memento: vscode.Memento): PdfState {
  return {
    get: (key) => memento.get(key),
    update: (key, value) => Promise.resolve(memento.update(key, value)),
  };
}
