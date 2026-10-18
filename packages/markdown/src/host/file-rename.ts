import * as vscode from "vscode";
import { posixBasename, posixExtname } from "@workshop/platform";
import type { HostDocument } from "../shared/host";

/** Native recheck: a title rename cannot move a note out of its current folder. */
export async function renameFile(
  document: HostDocument,
  target: string,
): Promise<void> {
  const source = vscode.Uri.parse(document.uri);
  const destination = vscode.Uri.parse(target);
  if (
    document.isUntitled ||
    source.scheme !== "file" ||
    destination.scheme !== "file"
  ) {
    throw new Error("Save the note before renaming it.");
  }
  if (
    source.authority !== destination.authority ||
    folderOf(source) !== folderOf(destination) ||
    posixExtname(source.path) !== posixExtname(destination.path) ||
    destination.query ||
    destination.fragment ||
    /[\\\r\n\0]/.test(posixBasename(destination.path))
  ) {
    throw new Error("Invalid note rename target.");
  }
  const edit = new vscode.WorkspaceEdit();
  edit.renameFile(source, destination, { overwrite: false });
  if (!(await vscode.workspace.applyEdit(edit))) {
    throw new Error("The note could not be renamed.");
  }
}

/** The note's folder as a file-system path (normalized as `fsPath` is). */
function folderOf(uri: vscode.Uri): string {
  return vscode.Uri.joinPath(uri, "..").fsPath;
}
