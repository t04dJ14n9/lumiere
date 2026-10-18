import type { ExtensionContext } from "vscode";
import type { RootContext } from "@workshop/core";
import type { HostPlatform } from "@workshop/platform";
import type { GitAccess } from "../shared/git";
import { createApi } from "./api/facade";
import { nativePlatform } from "./api/native-platform";
import type { MarkdownWorkshopApi } from "./api/types";
import { createHostServices } from "./services";
import { createConfiguration } from "./configuration-access";
import { bootstrap } from "./bootstrap";
import { createVaultSystem } from "./vault-system";
import { registerDocumentWarm } from "./document-warm";

export { pluginRank } from "../plugins/catalog";
export { outputLogger } from "./logging";
export type { MarkdownWorkshopApi } from "./api/types";
export type { GitAccess } from "../shared/git";

/**
 * Start Markdown Workshop in the extension's plugin tree and return its
 * public API. The tree's owner stops it on deactivation.
 */
export async function startMarkdown(
  root: RootContext,
  context: ExtensionContext,
  { platform, git }: { platform: HostPlatform; git: GitAccess },
): Promise<MarkdownWorkshopApi> {
  const configuration = createConfiguration();
  const host = createHostServices({
    extension: context.extension,
    storage: context.workspaceState,
    platform,
    git,
    configuration,
  });
  context.subscriptions.push(registerDocumentWarm());
  await bootstrap(
    host,
    createVaultSystem(context, platform, configuration),
    root,
  );
  return createApi(
    root,
    nativePlatform(context.extension.id, platform.realPaths),
  );
}
