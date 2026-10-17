import * as vscode from "vscode";
import path from "node:path";
import type { HostDocument } from "../shared/runtime";

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
    path.dirname(source.fsPath) !== path.dirname(destination.fsPath) ||
    path.extname(source.path) !== path.extname(destination.path) ||
    destination.query ||
    destination.fragment ||
    /[\\\r\n\0]/.test(path.basename(destination.path))
  ) {
    throw new Error("Invalid note rename target.");
  }
  const edit = new vscode.WorkspaceEdit();
  edit.renameFile(source, destination, { overwrite: false });
  if (!(await vscode.workspace.applyEdit(edit))) {
    throw new Error("The note could not be renamed.");
  }
}
