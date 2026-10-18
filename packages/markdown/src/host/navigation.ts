import { RevealRouter, chooseRevealPanel } from "./reveal-router";
import linksManifest from "../plugins/links/manifest";
import { pluginConfiguration } from "./settings";
import type { Configuration } from "../shared/configuration";
import { createConfiguration } from "./configuration-access";
import * as vscode from "vscode";
import {
  isInsidePosixPath,
  relativePosixPath,
  type HostPlatform,
  type RealPaths,
} from "@workshop/platform";
import type {
  Navigation,
  OpenPlace,
  NavigationTarget,
  NavigationIntent,
  PanelShell,
} from "../shared/host";
import { warmMarkdownDocument } from "./document-warm";
import { registerNativeLinks } from "./native-links";
import { MARKDOWN_EDITOR } from "../shared/editor-provider";

/**
 * All navigation paths are checked again in the native adapter, including
 * symlinks: through `realPaths` for local files where the platform has a
 * disk, and one path component at a time everywhere else.
 */
export async function contained(
  root: vscode.Uri,
  target: vscode.Uri,
  realPaths: RealPaths | undefined,
): Promise<void> {
  if (
    root.scheme !== target.scheme ||
    root.authority !== target.authority ||
    !isInsidePosixPath(root.path, target.path)
  ) {
    throw new Error("Link escapes the vault");
  }
  if (root.scheme === "file" && realPaths) {
    // A link may name a note that does not exist yet: judge it by its folder.
    if (
      !(await realPaths.isInside(
        root.fsPath,
        target.fsPath,
        "nearest-ancestor",
      ))
    ) {
      throw new Error("Link symlink escapes the vault");
    }
  } else {
    await containedVirtualPath(root, target);
  }
}

async function containedVirtualPath(
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

/** What navigation needs from the platform: link tickets and symlink checks. */
export type NavigationPlatform = Pick<HostPlatform, "digests" | "realPaths">;

export function createNavigation(
  panels: () => readonly PanelShell[],
  platform: NavigationPlatform,
  configuration: Configuration = createConfiguration(),
): NativeNavigation {
  const { realPaths } = platform;
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
    confirm: confirmOpen,
    async resolve(request) {
      await configuration.prepare(request.source);
      return resolveNavigation({
        ...request,
        realPaths,
        newNoteFolder:
          request.newNoteFolder ??
          configuredNewNoteFolder(configuration, request.source),
      });
    },
    open: (
      ...[root, target, fragment, place, at, intent]: Parameters<
        Navigation["open"]
      >
    ) =>
      openNavigation({
        root,
        target,
        fragment,
        place,
        ...(at === undefined ? {} : { at }),
        panels,
        reveals,
        intent: intent ?? reveals.begin(),
        realPaths,
      }),
    registerNativeLinks() {
      const links = registerNativeLinks(navigation, platform);
      return () => links.dispose();
    },
  };
  return navigation;
}

async function confirmOpen(message: string): Promise<boolean> {
  return (
    (await vscode.window.showWarningMessage(
      message,
      { modal: true },
      "Open",
    )) === "Open"
  );
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
  realPaths,
}: Parameters<Navigation["resolve"]>[0] & {
  realPaths: RealPaths | undefined;
}): Promise<string | undefined> {
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
  await contained(base, uri, realPaths);
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
      await contained(base, uri, realPaths);
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
    realPaths,
  });
}

async function createNote({
  base,
  sourceUri,
  link,
  uri: candidate,
  folder,
  intent,
  realPaths,
}: {
  base: vscode.Uri;
  sourceUri: vscode.Uri;
  link: string;
  uri: vscode.Uri;
  folder: string | undefined;
  intent?: NavigationIntent;
  realPaths: RealPaths | undefined;
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
  await contained(base, uri, realPaths);
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
  place: OpenPlace;
  at?: number;
  panels: () => readonly PanelShell[];
  reveals: RevealRouter;
  intent: NavigationIntent;
  realPaths: RealPaths | undefined;
}

async function openNavigation(options: OpenNavigation): Promise<void> {
  const { root, target, place, panels, intent } = options;
  const uri = vscode.Uri.parse(target);
  await contained(vscode.Uri.parse(root), uri, options.realPaths);
  if (intent.token.cancelled) {
    return;
  }
  const activeColumn =
    intent.column ?? vscode.window.tabGroups.activeTabGroup.viewColumn;
  const column = place === "side" ? vscode.ViewColumn.Beside : activeColumn;
  // A tab of its own is one VS Code keeps, not the preview the next link replaces.
  const show =
    place === "tab" ? { viewColumn: column, preview: false } : column;
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
      show,
    );
    await revealOpenedNote(options, before, activeColumn);
  } else if (/\.pdf$/i.test(uri.path)) {
    await openPdf(uri, options.fragment, column);
  } else {
    await vscode.commands.executeCommand(
      "vscode.open",
      uri.with({ fragment: options.fragment }),
      show,
    );
  }
}

/** PDF Workshop's public command (in this extension): open a PDF at a location. */
export const PDF_OPEN_LOCATION_COMMAND = "pdfWorkshop.openLocation";

/**
 * Open a PDF in PDF Workshop, at the page a link such as
 * `[[paper.pdf#page=3]]` names. Any other fragment (Obsidian ignores those
 * too) opens the PDF where it was left.
 */
async function openPdf(
  uri: vscode.Uri,
  fragment: string,
  column: vscode.ViewColumn,
): Promise<void> {
  const location = /^page=\d+(&|$)/i.test(fragment) ? fragment : "";
  await vscode.commands.executeCommand(
    PDF_OPEN_LOCATION_COMMAND,
    uri.with({ fragment: location }),
    undefined,
    { viewColumn: column },
  );
}

async function revealOpenedNote(
  options: OpenNavigation,
  before: ReadonlySet<string>,
  column: number,
): Promise<void> {
  const { panels, target, place, fragment, at, reveals, intent } = options;
  if (intent.token.cancelled || (!fragment && at === undefined)) {
    return;
  }
  const destination: NavigationTarget = {
    fragment,
    ...(at === undefined ? {} : { at }),
  };
  const panel = chooseRevealPanel(panels(), before, {
    uri: vscode.Uri.parse(target).toString(),
    side: place === "side",
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
