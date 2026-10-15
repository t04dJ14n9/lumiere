import { window, workspace } from "vscode";
import { outputLogger } from "./logging";
import { createApi } from "./api/facade";
import { nativePlatform } from "./api/native-platform";
import type { MarkdownWorkshopApi } from "./api/types";
import type { ExtensionContext } from "vscode";
import { createWorkshop } from "./workshop";
import { createConfiguration } from "./configuration-access";
import { bootstrap } from "./bootstrap";
import { createVaultSystem } from "./vault-system";
import { createHostViews } from "./views";
import { registerDocumentWarm } from "./document-warm";
import { registerReclaim } from "./reclaim";
import type { Context } from "../kernel";

/** The window's kernel; `deactivate` awaits its teardown. */
let root: Context | undefined;
export async function activate(
  context: ExtensionContext,
): Promise<MarkdownWorkshopApi> {
  const started = performance.now();
  const configuration = createConfiguration();
  const workshop = createWorkshop(
    context.extensionUri,
    context.workspaceState,
    configuration,
  );
  workshop.views = createHostViews(context.extensionUri, configuration);
  const channel = window.createOutputChannel("Markdown Workshop", {
    log: true,
  });
  context.subscriptions.push(
    channel,
    registerDocumentWarm(),
    registerReclaim(),
  );
  const logger = outputLogger(channel, () =>
    workspace.getConfiguration("markdownWorkshop").get("debug.logging", false),
  );
  root = await bootstrap(
    workshop,
    createVaultSystem(context, configuration),
    logger,
  );
  channel.info(`Activated in ${Math.round(performance.now() - started)} ms`);
  return createApi(root, nativePlatform());
}
/** VS Code awaits this (subscriptions' disposals it does not), so teardown completes. */
export async function deactivate(): Promise<void> {
  const stopping = root;
  root = undefined;
  await stopping?.dispose();
}
