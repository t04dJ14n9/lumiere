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
  const root = await bootstrap(workbench, createVaultSystem(context));
  const api = await createApi(root, nativePlatform());
  context.subscriptions.push({
    dispose() {
      void root.dispose();
    },
  });
  return api;
}
export function deactivate(): void {}
