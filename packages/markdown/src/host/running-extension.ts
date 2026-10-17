import * as vscode from "vscode";

/** The running extension, as VS Code describes it (`context.extension`). */
export type RunningExtension = Pick<
  vscode.Extension<unknown>,
  "id" | "packageJSON" | "extensionUri"
>;

/** A built worker script (dist/markdown/workers) of the running extension. */
export function workerPath(extensionUri: vscode.Uri, name: string): string {
  return vscode.Uri.joinPath(
    extensionUri,
    "dist",
    "markdown",
    "workers",
    `${name}.cjs`,
  ).fsPath;
}
