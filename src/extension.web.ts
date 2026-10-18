/**
 * Workshop: Markdown and PDF in the browser, where VS Code runs the
 * extension in a web worker (vscode.dev, github.dev, VS Code for the Web):
 * web workers and JavaScript digests, no Git, and none of the PDF plugins
 * that hand local files to agents. The composition itself is
 * src/activate.ts.
 */
import { Uri, type ExtensionContext } from "vscode";
import type { MarkdownWorkshopApi } from "@workshop/markdown/host";
import { webPlatform } from "@workshop/platform/web";
import { activateWorkshop, deactivateWorkshop } from "./activate";

export function activate(
  context: ExtensionContext,
): Promise<MarkdownWorkshopApi> {
  const workers = Uri.joinPath(context.extensionUri, "dist/markdown/workers");
  return activateWorkshop(context, {
    platform: webPlatform(workers.toString(true)),
    pdfPlugins: [],
  });
}

/** VS Code awaits this (unlike subscriptions' disposal), so teardown completes. */
export function deactivate(): Promise<void> {
  return deactivateWorkshop();
}
