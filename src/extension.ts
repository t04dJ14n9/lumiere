/**
 * Workshop: Markdown and PDF on the desktop, where the extension host runs
 * Node (VS Code, Cursor, and remote hosts such as SSH or Codespaces): Node
 * workers, digests and real paths, Git, and the PDF plugins that hand files
 * to agents. The composition itself is src/activate.ts.
 */
import type { ExtensionContext } from "vscode";
import { createGitAccess } from "@workshop/markdown/desktop";
import type { MarkdownWorkshopApi } from "@workshop/markdown/host";
import { pdfDesktopPlugins } from "@workshop/pdf/desktop";
import { nodePlatform } from "@workshop/platform/node";
import { activateWorkshop, deactivateWorkshop } from "./activate";

export function activate(
  context: ExtensionContext,
): Promise<MarkdownWorkshopApi> {
  return activateWorkshop(context, {
    platform: nodePlatform(context.extensionPath),
    git: createGitAccess(),
    pdfPlugins: pdfDesktopPlugins,
  });
}

/** VS Code awaits this (unlike subscriptions' disposal), so teardown completes. */
export function deactivate(): Promise<void> {
  return deactivateWorkshop();
}
