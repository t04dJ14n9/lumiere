/**
 * Attachments host half: each note page asks to save bytes (or import a URL)
 * into the vault attachment folder; this side writes the file and returns the
 * embed string. Remote / file:// loads happen here — webview CSP has no https.
 *
 * Explorer drops without Shift never reach the webview (VS Code disables
 * pointer events on the iframe unless Shift). Those drops open a pinned tab
 * (EditorDropTarget sets pinned:true); we reclaim matching pinned media tabs
 * back into timestamp attachments. Preview (single-click) opens are left alone.
 */
import * as vscode from "vscode";
import type { Context, Plugin, PluginHandle } from "@workshop/core";
import {
  decodeBase64,
  insertEmbed,
  loadAttachmentSource,
  saveAttachment,
  shouldReclaimExplorerOpen,
} from "../../attachments";
import { MARKDOWN_EDITOR } from "../../shared/editor-provider";
import { asString } from "../../shared/values";
import type { EditorPanel } from "../editor/api";
import type {} from "../vault/api";
import { protocol } from "./protocol";

type SaveResult = {
  ok: boolean;
  embed?: string;
  path?: string;
  error?: string;
};

export const attachmentsHost: Plugin = {
  name: "attachments",
  inject: {
    required: [
      "editors",
      "vaults",
      "workspace",
      "settings",
      "dialogs",
      "hostDocuments",
    ],
  },
  apply(ctx) {
    answerNotePages(ctx);
    reclaimExplorerOpens(ctx);
  },
};

function answerNotePages(ctx: Context): void {
  const pages = new Map<string, PluginHandle>();
  const bind = (panel: EditorPanel) => {
    const fiber = ctx.plugin({
      name: `attachments:${panel.id}`,
      apply(owned) {
        owned.effect(() =>
          panel.rpc.handle(protocol, "save", (params) =>
            saveForPanel(ctx, panel, params),
          ),
        );
        owned.effect(() =>
          panel.rpc.handle(protocol, "importUrl", (params) =>
            importUrlForPanel(ctx, panel, params.url),
          ),
        );
      },
    });
    pages.set(panel.id, fiber);
  };
  ctx.on("editor/opened", (opened) => {
    const panel = ctx.editors.all().find((item) => item.id === opened.id);
    if (panel) {
      bind(panel);
    }
  });
  ctx.on("editor/closed", (closed) => {
    void pages.get(closed.id)?.dispose();
    pages.delete(closed.id);
  });
  for (const panel of ctx.editors.all()) {
    bind(panel);
  }
}

/**
 * Track which Lumière note was active per column, then convert Explorer
 * open-on-drop pinned media tabs into attachments on that note.
 */
function reclaimExplorerOpens(ctx: Context): void {
  /** viewColumn → Lumière note URI last known active in that column. */
  const priorLumiere = new Map<number, string>();
  const syncPrior = () => {
    for (const group of vscode.window.tabGroups.all) {
      const column = group.viewColumn;
      if (column === undefined) {
        continue;
      }
      const active = group.activeTab;
      if (active && isLumiereTab(active)) {
        const uri = tabUri(active)?.toString();
        if (uri) {
          priorLumiere.set(column, uri);
          continue;
        }
      }
      // Clear when another editor is active so a later media open is not
      // mistaken for a drop onto this note.
      priorLumiere.delete(column);
    }
  };
  syncPrior();
  ctx.effect(() => {
    const sub = vscode.window.tabGroups.onDidChangeTabs((event) => {
      const victims = [...event.opened];
      // Snapshot priors before syncing — opens have already stolen active.
      void reclaimOpenedTabs(ctx, victims, priorLumiere).finally(syncPrior);
    });
    return () => sub.dispose();
  });
}

async function reclaimOpenedTabs(
  ctx: Context,
  opened: readonly vscode.Tab[],
  priorLumiere: ReadonlyMap<number, string>,
): Promise<void> {
  for (const tab of opened) {
    await reclaimOneTab(ctx, tab, priorLumiere);
  }
}

async function reclaimOneTab(
  ctx: Context,
  tab: vscode.Tab,
  priorLumiere: ReadonlyMap<number, string>,
): Promise<void> {
  const resource = tabUri(tab);
  const column = tab.group.viewColumn;
  if (!resource || column === undefined) {
    return;
  }
  const priorNote = priorLumiere.get(column);
  const lumiereTab = tab.group.tabs.find(isLumiereTab);
  const lumiereUri = lumiereTab ? tabUri(lumiereTab)?.toString() : undefined;
  if (
    !shouldReclaimExplorerOpen({
      openedPath: resource.fsPath || resource.path,
      isPreview: tab.isPreview,
      groupHadLumiereNote: Boolean(lumiereUri),
      priorActiveWasLumiere: Boolean(
        priorNote && lumiereUri && priorNote === lumiereUri,
      ),
    })
  ) {
    return;
  }
  const panel = ctx.editors
    .all()
    .find((item) => item.document.uri === lumiereUri && item.column === column);
  if (!panel) {
    return;
  }

  // Close the workbench's open-on-drop tab and put the note back in front.
  try {
    await vscode.window.tabGroups.close(tab, true);
  } catch {
    // Tab may already be gone.
  }
  panel.reveal();

  const saved = await importUrlForPanel(ctx, panel, resource.toString());
  if (!saved.ok || !saved.embed) {
    return;
  }
  const snapshot = await ctx.editors.capture(panel.id).catch(() => undefined);
  const edit = insertEmbed(
    panel.document.getText(),
    snapshot?.state.head,
    saved.embed,
  );
  await ctx.hostDocuments.apply(panel.document, [edit]);
}

function isLumiereTab(tab: vscode.Tab): boolean {
  const input = tab.input;
  return (
    typeof vscode.TabInputCustom === "function" &&
    input instanceof vscode.TabInputCustom &&
    input.viewType === MARKDOWN_EDITOR.viewType
  );
}

function tabUri(tab: vscode.Tab): vscode.Uri | undefined {
  const input = tab.input as { uri?: vscode.Uri } | undefined;
  return input?.uri;
}

async function saveForPanel(
  ctx: Context,
  panel: EditorPanel,
  params: { bytesBase64: string; ext: string },
): Promise<SaveResult> {
  const bytes = decodeBase64(params.bytesBase64);
  if (!bytes) {
    return fail(ctx, "Could not read the image data.");
  }
  return writeAttachment(ctx, panel, bytes, params.ext);
}

async function importUrlForPanel(
  ctx: Context,
  panel: EditorPanel,
  url: string,
): Promise<SaveResult> {
  const loaded = await loadAttachmentSource(url, {
    fetch: (target) => fetch(target),
    readFile: readUriBytes,
  });
  if (!loaded) {
    return fail(ctx, "Could not download or read that image.");
  }
  return writeAttachment(ctx, panel, loaded.bytes, loaded.ext);
}

async function writeAttachment(
  ctx: Context,
  panel: EditorPanel,
  bytes: Uint8Array,
  ext: string,
): Promise<SaveResult> {
  const located = await ctx.vaults.locate(panel.document.uri);
  if (!located) {
    return fail(ctx, "Attachments need a vault: open this note from one.");
  }
  const links = ctx.settings.forNote(panel.document).features?.links?.config;
  try {
    const saved = await saveAttachment({
      files: ctx.workspace.files,
      root: located.vault.index.root,
      notePath: located.path,
      attachmentFolder: asString(links?.attachmentFolder) ?? "",
      useWikilinks: links?.useWikilinks !== false,
      format: linkFormat(links?.newLinkFormat),
      ext,
      bytes,
      vaultPaths: located.vault.index.files().map((file) => file.path),
    });
    if (!saved) {
      return fail(ctx, "Could not save the attachment.");
    }
    return { ok: true, embed: saved.embed, path: saved.path };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not save the attachment.";
    return fail(ctx, message);
  }
}

async function readUriBytes(uri: string): Promise<Uint8Array | undefined> {
  try {
    return await vscode.workspace.fs.readFile(vscode.Uri.parse(uri));
  } catch {
    return undefined;
  }
}

function fail(ctx: Context, error: string): SaveResult {
  ctx.dialogs.error(error);
  return { ok: false, error };
}

function linkFormat(value: unknown): "shortest" | "relative" | "absolute" {
  return value === "relative" || value === "absolute" ? value : "shortest";
}
