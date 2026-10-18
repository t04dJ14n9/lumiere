import * as vscode from "vscode";
import {
  isInsidePosixPath,
  relativePosixPath,
  type RealPaths,
} from "@workshop/platform";

/**
 * A native link may open only a file in its workspace folder. Local files
 * are judged by where their symbolic links lead, through `realPaths`, where
 * the platform has a disk. Elsewhere (virtual workspaces, a local folder
 * opened in the browser) the path must stay inside the folder and no
 * component of it may be a symbolic link, as Markdown Workshop's links.
 */
export async function containedLink(
  root: vscode.Uri,
  target: vscode.Uri,
  realPaths: RealPaths | undefined,
): Promise<void> {
  if (root.scheme !== target.scheme || root.authority !== target.authority) {
    throw new Error("Local workspace links only");
  }
  if (root.scheme === "file" && realPaths) {
    if (!(await realPaths.isInside(root.fsPath, target.fsPath))) {
      throw new Error("Link escapes workspace folder");
    }
    return;
  }
  if (!isInsidePosixPath(root.path, target.path)) {
    throw new Error("Link escapes workspace folder");
  }
  await refuseSymbolicLinks(root, target);
}

async function refuseSymbolicLinks(
  root: vscode.Uri,
  target: vscode.Uri,
): Promise<void> {
  let current = root;
  for (const component of relativePosixPath(root.path, target.path)
    .split("/")
    .filter(Boolean)) {
    current = vscode.Uri.joinPath(current, component);
    try {
      const stat = await vscode.workspace.fs.stat(current);
      if (stat.type & vscode.FileType.SymbolicLink) {
        throw new Error("Symbolic link refused");
      }
    } catch (error) {
      if (
        !(error instanceof vscode.FileSystemError) ||
        error.code !== "FileNotFound"
      ) {
        throw error;
      }
    }
  }
}
