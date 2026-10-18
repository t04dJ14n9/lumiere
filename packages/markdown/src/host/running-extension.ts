import type * as vscode from "vscode";

/** The running extension, as VS Code describes it (`context.extension`). */
export type RunningExtension = Pick<
  vscode.Extension<unknown>,
  "id" | "packageJSON" | "extensionUri"
>;
