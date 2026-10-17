import { RevealRouter, chooseRevealPanel } from "./reveal-router";
import linksManifest from "../plugins/links/manifest";
import { pluginConfiguration } from "./settings";
import type { Configuration } from "../shared/configuration";
import { createConfiguration } from "./configuration-access";
import * as vscode from "vscode";
import { realpath } from "node:fs/promises";
import path from "node:path";
import type {
  Navigation,
  NavigationTarget,
  NavigationIntent,
  PanelShell,
} from "../shared/host";
import { warmMarkdownDocument } from "./document-warm";
import { registerNativeLinks } from "./native-links";
import { MARKDOWN_EDITOR } from "../shared/editor-provider";

/** All navigation paths are checked again in the native adapter, including symlinks. */
export async function contained(
  root: vscode.Uri,
  target: vscode.Uri,
): Promise<void> {
  const relative = path.posix.relative(root.path, target.path);
  if (
    root.scheme !== target.scheme ||
    root.authority !== target.authority ||
    relative === ".." ||
    relative.startsWith("../") ||
    path.posix.isAbsolute(relative)
  ) {
    throw new Error("Link escapes the vault");
  }
  if (root.scheme === "file") {
    await containedLocalPath(root, target);
  } else {
    await containedVirtualPath(root, relative);
  }
}

async function containedLocalPath(
  root: vscode.Uri,
  target: vscode.Uri,
): Promise<void> {
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
      ) {
        throw new Error("Link symlink escapes the vault");
      }
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      const parent = path.dirname(candidate);
      if (parent === candidate) {
        throw error;
      }
      candidate = parent;
    }
  }
}

async function containedVirtualPath(
  root: vscode.Uri,
  relative: string,
): Promise<void> {
  let current = root;
  for (const component of relative.split("/").filter(Boolean)) {
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

export function createNavigation(
  panels: () => readonly PanelShell[],
  configuration: Configuration = createConfiguration(),
): NativeNavigation {
  const reveals = new RevealRouter();
  const navigation: NativeNavigation = {
    begin: () => reveals.begin(),
    registerReveal: (panel) => reveals.register(panel),
    async revealOpened(uri, column, at, intent) {
      const current = panels();
      const panel = chooseRevealPanel(
        current,
        new Set(current.map((panel) => panel.id)),
        { uri, side: false, column },
      );
      if (panel) {
        await reveals.deliver(intent, panel.id, { fragment: "", at });
      }
    },
    scheme: vscode.env.uriScheme,
    external: async (href) => vscode.env.openExternal(vscode.Uri.parse(href)),
    confirm: async (message) =>
      (await vscode.window.showWarningMessage(
        message,
        { modal: true },
        "Open",
      )) === "Open",
    async resolve(request) {
      await configuration.prepare(request.source);
      return resolveNavigation({
        ...request,
        newNoteFolder:
          request.newNoteFolder ??
          configuredNewNoteFolder(configuration, request.source),
      });
    },
    open: (
      ...[root, target, fragment, side, at, intent]: Parameters<
        Navigation["open"]
      >
    ) =>
      openNavigation({
        root,
        target,
        fragment,
        side,
        ...(at === undefined ? {} : { at }),
        panels,
        reveals,
        intent: intent ?? reveals.begin(),
      }),
    registerNativeLinks() {
      const links = registerNativeLinks(navigation);
      return () => links.dispose();
    },
  };
  return navigation;
}

/** Native text-to-custom transfers already opened the destination in this group. */
export interface NativeNavigation extends Navigation {
  begin(): NavigationIntent;
  revealOpened(
    uri: string,
    column: number,
    at: number,
    intent: NavigationIntent,
  ): Promise<void>;
}

async function resolveNavigation({
  root,
  source,
  path: link,
  create,
  folderNote,
  newNoteFolder,
  intent,
}: Parameters<Navigation["resolve"]>[0]): Promise<string | undefined> {
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
    if (intent?.token.cancelled) {
      return undefined;
    }
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
    ) {
      throw error;
    }
  }
  if (!create || intent?.token.cancelled) {
    return undefined;
  }
  return createNote({
    base,
    sourceUri,
    link,
    uri,
    folder: newNoteFolder,
    ...(intent ? { intent } : {}),
  });
}

async function createNote({
  base,
  sourceUri,
  link,
  uri: candidate,
  folder,
  intent,
}: {
  base: vscode.Uri;
  sourceUri: vscode.Uri;
  link: string;
  uri: vscode.Uri;
  folder: string | undefined;
  intent?: NavigationIntent;
}): Promise<string | undefined> {
  folder ??= "";
  let uri = candidate;
  if (!link.startsWith("/")) {
    const parent =
      folder === "."
        ? vscode.Uri.joinPath(sourceUri, "..")
        : vscode.Uri.joinPath(base, folder);
    uri = vscode.Uri.joinPath(parent, link);
  }
  if (!/\.md$/i.test(uri.path)) {
    uri = uri.with({ path: uri.path + ".md" });
  }
  await contained(base, uri);
  if (intent?.token.cancelled) {
    return undefined;
  }
  const edit = new vscode.WorkspaceEdit();
  edit.createFile(uri, { ignoreIfExists: true });
  if (!(await vscode.workspace.applyEdit(edit))) {
    throw new Error("Could not create note");
  }
  return uri.toString();
}

interface OpenNavigation {
  root: string;
  target: string;
  fragment: string;
  side: boolean;
  at?: number;
  panels: () => readonly PanelShell[];
  reveals: RevealRouter;
  intent: NavigationIntent;
}

async function openNavigation(options: OpenNavigation): Promise<void> {
  const { root, target, side, panels, intent } = options;
  const uri = vscode.Uri.parse(target);
  await contained(vscode.Uri.parse(root), uri);
  if (intent.token.cancelled) {
    return;
  }
  const activeColumn =
    intent.column ?? vscode.window.tabGroups.activeTabGroup.viewColumn;
  const column = side ? vscode.ViewColumn.Beside : activeColumn;
  const before = new Set(panels().map((panel) => panel.id));
  if (/\.(md|markdown)$/i.test(uri.path)) {
    await warmMarkdownDocument(uri);
    if (intent.token.cancelled) {
      return;
    }
    await vscode.commands.executeCommand(
      "vscode.openWith",
      uri,
      MARKDOWN_EDITOR.viewType,
      column,
    );
    await revealOpenedNote(options, before, activeColumn);
  } else {
    await vscode.commands.executeCommand(
      "vscode.open",
      uri.with({ fragment: options.fragment }),
      column,
    );
  }
}

async function revealOpenedNote(
  options: OpenNavigation,
  before: ReadonlySet<string>,
  column: number,
): Promise<void> {
  const { panels, target, side, fragment, at, reveals, intent } = options;
  if (intent.token.cancelled || (!fragment && at === undefined)) {
    return;
  }
  const destination: NavigationTarget = {
    fragment,
    ...(at === undefined ? {} : { at }),
  };
  const panel = chooseRevealPanel(panels(), before, {
    uri: vscode.Uri.parse(target).toString(),
    side,
    column,
  });
  if (!panel) {
    throw new Error("The destination editor was not opened unambiguously");
  }
  // Superseded requests return false and leave no mailbox for a later reload.
  await reveals.deliver(intent, panel.id, destination);
}

function configuredNewNoteFolder(
  configuration: Configuration,
  source: string,
): string {
  const config = {
    get: <T>(key: string, fallback?: T) =>
      configuration.get(key, fallback, source),
  };
  return String(pluginConfiguration(config, linksManifest).newNoteFolder);
}
