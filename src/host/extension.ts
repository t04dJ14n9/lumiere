import type { ExtensionContext } from "vscode";
import { createWorkbench } from "./workbench";
import { bootstrap } from "./bootstrap";
import { createVaultSystem } from "./vault-system";
import { createHostViews } from "./views";
export async function activate(context: ExtensionContext): Promise<void> {
  const workbench = createWorkbench(
    context.extensionUri,
    context.workspaceState,
  );
  workbench.views = createHostViews();
  const root = await bootstrap(workbench, createVaultSystem(context));
  context.subscriptions.push({
    dispose() {
      void root.dispose();
    },
  });
}
export function deactivate(): void {}
