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
export async function activate(
  context: ExtensionContext,
): Promise<MarkdownWorkbenchApi> {
  const workbench = createWorkbench(
    context.extensionUri,
    context.workspaceState,
  );
  workbench.views = createHostViews();
  const channel = window.createOutputChannel("Markdown Workbench", {
    log: true,
  });
  context.subscriptions.push(channel);
  const logger = outputLogger(channel, () =>
    workspace.getConfiguration("markdownWorkbench").get("debug.logging", false),
  );
  const root = await bootstrap(workbench, createVaultSystem(context), logger);
  const api = await createApi(root, nativePlatform());
  context.subscriptions.push({
    dispose() {
      void root.dispose();
    },
  });
  return api;
}
export function deactivate(): void {}
