import * as vscode from "vscode";

/**
 * Parse a URI string from a plugin. A vault root at the top of a file system
 * has no path once its trailing slash is trimmed (`demo:`,
 * `vscode-test-web://mount`, `file://`), and `Uri.joinPath` refuses such a
 * URI; `/` names the same folder.
 */
export function parseUri(text: string, strict?: boolean): vscode.Uri {
  const uri = vscode.Uri.parse(text, strict);
  return uri.path ? uri : uri.with({ path: "/" });
}
