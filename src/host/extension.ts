import { window, workspace } from "vscode";
import { outputLogger } from "./logging";
import { createApi } from "./api/facade";
import { nativePlatform } from "./api/native-platform";
import type { MarkdownWorkbenchApi } from "./api/types";
import type { ExtensionContext } from "vscode";
import { createWorkbench } from "./workbench";
import { bootstrap } from "./bootstrap";
import { createVaultSystem } from "./vault-system";
import { createHostViews } from "./views";
import { registerReclaim } from "./reclaim";
import type { Context } from "../kernel";

/** The window's kernel; `deactivate` awaits its teardown. */
let root: Context | undefined;
export async function activate(
  context: ExtensionContext,
): Promise<MarkdownWorkbenchApi> {
  const started = performance.now();
  const workbench = createWorkbench(
    context.extensionUri,
    context.workspaceState,
  );
  workbench.views = createHostViews();
  const channel = window.createOutputChannel("Markdown Workbench", {
    log: true,
  });
  context.subscriptions.push(channel, registerReclaim());
  const logger = outputLogger(channel, () =>
    workspace.getConfiguration("markdownWorkbench").get("debug.logging", false),
  );
  root = await bootstrap(workbench, createVaultSystem(context), logger);
  channel.info(`Activated in ${Math.round(performance.now() - started)} ms`);
  return createApi(root, nativePlatform());
}
/** VS Code awaits this (subscriptions' disposals it does not), so teardown completes. */
export async function deactivate(): Promise<void> {
  const stopping = root;
  root = undefined;
  await stopping?.dispose();
}
