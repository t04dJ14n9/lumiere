import * as vscode from "vscode";

/** The running extension, as VS Code describes it (`context.extension`). */
export type RunningExtension = Pick<
  vscode.Extension<unknown>,
  "id" | "packageJSON" | "extensionUri"
>;

/** The running extension's built worker scripts (dist/markdown/workers). */
export function workersFolder(extensionUri: vscode.Uri): string {
  return vscode.Uri.joinPath(extensionUri, "dist", "markdown", "workers")
    .fsPath;
}
