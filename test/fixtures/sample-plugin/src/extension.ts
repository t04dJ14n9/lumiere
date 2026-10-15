// Activation: get Markdown Workshop's API and run the plugin through it.
// The plugin is in plugin.ts and receives `vscode` as a parameter, so unit
// tests can run it against the real API facade.
import * as vscode from "vscode";
import type { MarkdownWorkbenchApi } from "../../../../src/host/api/types";
import { ticketsPlugin } from "./plugin";

export async function activate(context: vscode.ExtensionContext) {
  const api = await vscode.extensions
    .getExtension<MarkdownWorkbenchApi>("t04dj14n9.vscode-markdown-workbench")
    ?.activate();
  if (api?.apiVersion !== 1) {
    void vscode.window.showWarningMessage(
      "Sample Tickets needs Markdown Workshop with API version 1.",
    );
    return;
  }
  // Disposing the handle unregisters the plugin and undoes everything it
  // registered: markers, the link claim, the processor and the command.
  context.subscriptions.push(api.plugin(ticketsPlugin(vscode)));
}

export function deactivate(): void {}
