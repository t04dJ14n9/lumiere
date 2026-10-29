import * as vscode from "vscode";
import type { PdfConfiguration } from "../../../shared/host";

/**
 * VS Code's settings by full key. A key is read as VS Code's settings API
 * reads it: its section (`lumiere.pdf.view`), then the name in it, scoped
 * to the file so folder settings apply.
 */
export const vscodePdfConfiguration: PdfConfiguration = {
  get(key, resource) {
    const dot = key.lastIndexOf(".");
    const scope =
      resource === undefined ? undefined : vscode.Uri.parse(resource);
    return vscode.workspace
      .getConfiguration(key.slice(0, Math.max(dot, 0)), scope)
      .get(key.slice(dot + 1));
  },
  onChange(listener) {
    const subscription = vscode.workspace.onDidChangeConfiguration((event) =>
      listener((section) => event.affectsConfiguration(section)),
    );
    return () => subscription.dispose();
  },
};
