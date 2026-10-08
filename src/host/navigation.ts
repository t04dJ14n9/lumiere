import * as vscode from "vscode";
import { realpath } from "node:fs/promises";
import path from "node:path";
import type { Navigation, NavigationTarget } from "../shared/runtime";

/** All navigation paths are checked again in the native adapter, including symlinks. */
async function contained(root: vscode.Uri, target: vscode.Uri): Promise<void> {
  const relative = path.posix.relative(root.path, target.path);
  if (
    root.scheme !== target.scheme ||
    root.authority !== target.authority ||
    relative === ".." ||
    relative.startsWith("../") ||
    path.posix.isAbsolute(relative)
  )
    throw new Error("Link escapes the vault");
  if (root.scheme === "file") {
    const base = await realpath(root.fsPath);
    let candidate = target.fsPath;
    while (true) {
      try {
        const actual = await realpath(candidate);
        const rel = path.relative(base, actual);
        if (
          rel === ".." ||
          rel.startsWith(".." + path.sep) ||
          path.isAbsolute(rel)
        )
          throw new Error("Link symlink escapes the vault");
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        const parent = path.dirname(candidate);
        if (parent === candidate) throw error;
        candidate = parent;
      }
    }
  } else {
    let current = root;
    for (const component of relative.split("/").filter(Boolean)) {
      current = vscode.Uri.joinPath(current, component);
      try {
        const stat = await vscode.workspace.fs.stat(current);
        if (stat.type & vscode.FileType.SymbolicLink)
          throw new Error("Symbolic link refused");
      } catch (error) {
        if (
          !(error instanceof vscode.FileSystemError) ||
          error.code !== "FileNotFound"
        )
          throw error;
      }
    }
  }
}
export function createNavigation(): Navigation {
  const pending = new Map<string, NavigationTarget>();
  const listeners = new Set<(uri: string, target: NavigationTarget) => void>();
  return {
    takeReveal(uri) {
      const fragment = pending.get(uri) ?? { fragment: "" };
      pending.delete(uri);
      return fragment;
    },
    onReveal(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    scheme: vscode.env.uriScheme,
    external: async (href) => vscode.env.openExternal(vscode.Uri.parse(href)),
    confirm: async (message) =>
      (await vscode.window.showWarningMessage(
        message,
        { modal: true },
        "Open",
      )) === "Open",
    async resolve({ root, source, path: link, create, folderNote }) {
      const base = vscode.Uri.parse(root);
      const sourceUri = vscode.Uri.parse(source);
      let uri = !link
        ? sourceUri
        : vscode.Uri.joinPath(
            link.startsWith("/") || create
              ? base
              : vscode.Uri.joinPath(sourceUri, ".."),
            link.replace(/^\//, ""),
          );
      await contained(base, uri);
      try {
        const stat = await vscode.workspace.fs.stat(uri);
        if (stat.type & vscode.FileType.Directory) {
          if (!folderNote) {
            await vscode.commands.executeCommand("revealInExplorer", uri);
            return undefined;
          }
          uri = vscode.Uri.joinPath(uri, folderNote);
          await contained(base, uri);
        }
        return uri.toString();
      } catch (error) {
        if (
          !(error instanceof vscode.FileSystemError) ||
          error.code !== "FileNotFound"
        )
          throw error;
      }
      if (!create) return undefined;
      const config = vscode.workspace.getConfiguration(
        "markdownWorkbench",
        sourceUri,
      );
      const folder = config.get<string>("files.newNoteFolder", "");
      if (!link.startsWith("/")) {
        const parent =
          folder === "."
            ? vscode.Uri.joinPath(sourceUri, "..")
            : vscode.Uri.joinPath(base, folder);
        uri = vscode.Uri.joinPath(parent, link);
      }
      if (!/\.md$/i.test(uri.path)) uri = uri.with({ path: uri.path + ".md" });
      await contained(base, uri);
      const edit = new vscode.WorkspaceEdit();
      edit.createFile(uri, { ignoreIfExists: true });
      if (!(await vscode.workspace.applyEdit(edit)))
        throw new Error("Could not create note");
      return uri.toString();
    },
    async open(root, target, fragment, side, at) {
      const uri = vscode.Uri.parse(target);
      await contained(vscode.Uri.parse(root), uri);
      const column = side ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active;
      if (/\.md$/i.test(uri.path)) {
        await vscode.commands.executeCommand(
          "vscode.openWith",
          uri,
          "markdownWorkbench.editor",
          column,
        );
        if (fragment || at !== undefined) {
          const destination = { fragment, at };
          pending.set(uri.toString(), destination);
          for (const listener of listeners)
            listener(uri.toString(), destination);
        }
      } else {
        await vscode.commands.executeCommand(
          "vscode.open",
          uri.with({ fragment }),
          column,
        );
      }
    },
  };
}
