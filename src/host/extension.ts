import type { ExtensionContext } from "vscode";
import { createWorkbench } from "./workbench";
import { bootstrap } from "./bootstrap";
import { createVaultSystem } from "./vault-system";
export async function activate(context: ExtensionContext): Promise<void> {
  const root = await bootstrap(
    createWorkbench(context.extensionUri, context.workspaceState),
    createVaultSystem(context),
  );
  context.subscriptions.push({
    dispose() {
      void root.dispose();
    },
  });
}
export function deactivate(): void {}
