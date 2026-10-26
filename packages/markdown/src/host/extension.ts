import { env, type ExtensionContext } from "vscode";
import type { RootContext } from "@workshop/core";
import { createApi } from "./api/facade";
import { nativePlatform } from "./api/native-platform";
import type { MarkdownWorkshopApi } from "./api/types";
import { createHostServices } from "./services";
import { createConfiguration } from "./configuration-access";
import { bootstrap } from "./bootstrap";
import { createVaultSystem } from "./vault-system";
import { registerDocumentWarm } from "./document-warm";
import { createCursorHandoffSurface } from "./cursor-handoff";

export { pluginRank } from "../plugins/catalog";
export { outputLogger } from "./logging";
export type { MarkdownWorkshopApi } from "./api/types";

/**
 * Start Lumière in the extension's plugin tree and return its
 * public API. The tree's owner stops it on deactivation.
 */
export async function startMarkdown(
  root: RootContext,
  context: ExtensionContext,
): Promise<MarkdownWorkshopApi> {
  const configuration = createConfiguration();
  const host = createHostServices(
    context.extension,
    context.workspaceState,
    configuration,
  );
  context.subscriptions.push(registerDocumentWarm());
  await bootstrap(host, createVaultSystem(context, configuration), root, {
    cursorBridge: {
      appName: env?.appName ?? "",
      surface: createCursorHandoffSurface(),
    },
  });
  return createApi(root, nativePlatform(context.extension.id));
}
