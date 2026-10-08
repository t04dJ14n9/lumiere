import type { ExtensionContext } from "vscode";
import { createWorkbench } from "./workbench";
import { bootstrap } from "./bootstrap";
export async function activate(context: ExtensionContext): Promise<void> {
  const root = await bootstrap(createWorkbench(context.extensionUri));
  context.subscriptions.push({
    dispose() {
      void root.dispose();
    },
  });
}
export function deactivate(): void {}
