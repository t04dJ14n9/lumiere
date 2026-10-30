/**
 * Attachments host half: each note page asks to save bytes (or import a URL)
 * into the vault attachment folder; this side writes the file and returns the
 * embed string. Remote / file:// loads happen here — webview CSP has no https.
 */
import * as vscode from "vscode";
import type { Context, Plugin, PluginHandle } from "@workshop/core";
import {
  decodeBase64,
  loadAttachmentSource,
  saveAttachment,
} from "../../attachments";
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
    required: ["editors", "vaults", "workspace", "settings", "dialogs"],
  },
  apply(ctx) {
    answerNotePages(ctx);
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
