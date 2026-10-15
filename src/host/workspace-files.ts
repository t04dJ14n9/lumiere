import * as vscode from "vscode";
import type { WorkspaceFiles } from "../shared/workspace-files";
import { contained } from "./navigation";

/** VS Code file operations behind `Workshop.files`. Missing files are undefined, not throws. */
export function createWorkspaceFiles(): WorkspaceFiles {
  return {
    authorize: (root, target) => contained(parse(root), parse(target)),
    readText,
    writeText,
    list,
    mkdir,
    copy,
    move,
    remove,
    isSymbolicLink,
    pickFile,
  };
}

async function readText(uri: string): Promise<string | undefined> {
  try {
    const bytes = await vscode.workspace.fs.readFile(parse(uri));
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return undefined;
  }
}

async function writeText(uri: string, text: string): Promise<void> {
  await vscode.workspace.fs.writeFile(
    parse(uri),
    new TextEncoder().encode(text),
  );
}

async function list(uri: string): Promise<readonly string[] | undefined> {
  try {
    const entries = await vscode.workspace.fs.readDirectory(parse(uri));
    return entries.map(([name]) => name);
  } catch {
    return undefined;
  }
}

async function mkdir(uri: string): Promise<void> {
  await vscode.workspace.fs.createDirectory(parse(uri));
}

async function copy(from: string, to: string): Promise<void> {
  await vscode.workspace.fs.copy(parse(from), parse(to), { overwrite: true });
}

async function move(from: string, to: string): Promise<void> {
  await vscode.workspace.fs.rename(parse(from), parse(to), {
    overwrite: false,
  });
}

async function remove(uri: string): Promise<void> {
  await vscode.workspace.fs.delete(parse(uri), { recursive: false });
}

async function isSymbolicLink(uri: string): Promise<boolean> {
  try {
    const info = await vscode.workspace.fs.stat(parse(uri));
    return Boolean(info.type & vscode.FileType.SymbolicLink);
  } catch {
    return false;
  }
}

async function pickFile(title: string): Promise<string | undefined> {
  const picked = await vscode.window.showOpenDialog({
    title,
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
  });
  return picked?.[0]?.toString();
}

function parse(uri: string): vscode.Uri {
  return vscode.Uri.parse(uri);
}
