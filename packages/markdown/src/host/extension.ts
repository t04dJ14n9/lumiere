import type { ExtensionContext } from "vscode";
import type { RootContext } from "@workshop/core";
import { createApi } from "./api/facade";
import { nativePlatform } from "./api/native-platform";
import type { MarkdownWorkshopApi } from "./api/types";
import { createWorkshop } from "./workshop";
import { createConfiguration } from "./configuration-access";
import { bootstrap } from "./bootstrap";
import { createVaultSystem } from "./vault-system";
import { createHostViews } from "./views";
import { registerDocumentWarm } from "./document-warm";

export { pluginRank } from "../plugins/catalog";
export { outputLogger } from "./logging";
export type { MarkdownWorkshopApi } from "./api/types";

/**
 * Start Markdown Workshop in the extension's plugin tree and return its
 * public API. The tree's owner stops it on deactivation.
 */
export async function startMarkdown(
  root: RootContext,
  context: ExtensionContext,
): Promise<MarkdownWorkshopApi> {
  const configuration = createConfiguration();
  const workshop = createWorkshop(
    context.extension,
    context.workspaceState,
    configuration,
  );
  workshop.views = createHostViews(context.extensionUri, configuration);
  context.subscriptions.push(registerDocumentWarm());
  await bootstrap(workshop, createVaultSystem(context, configuration), root);
  return createApi(root, nativePlatform(context.extension.id));
}
