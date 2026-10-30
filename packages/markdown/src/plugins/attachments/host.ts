/**
 * Attachments host half: each note page asks to save bytes into the vault
 * attachment folder; this side writes the file and returns the embed string.
 */
import type { Context, Plugin, PluginHandle } from "@workshop/core";
import { decodeBase64, saveAttachment } from "../../attachments";
import { asString } from "../../shared/values";
import type { EditorPanel } from "../editor/api";
import type {} from "../vault/api";
import { protocol } from "./protocol";

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
): Promise<{
  ok: boolean;
  embed?: string;
  path?: string;
  error?: string;
}> {
  const located = await ctx.vaults.locate(panel.document.uri);
  if (!located) {
    const error = "Attachments need a vault: open this note from one.";
    ctx.dialogs.error(error);
    return { ok: false, error };
  }
  const links = ctx.settings.forNote(panel.document).features?.links?.config;
  const bytes = decodeBase64(params.bytesBase64);
  if (!bytes) {
    const error = "Could not read the image data.";
    ctx.dialogs.error(error);
    return { ok: false, error };
  }
  try {
    const saved = await saveAttachment({
      files: ctx.workspace.files,
      root: located.vault.index.root,
      notePath: located.path,
      attachmentFolder: asString(links?.attachmentFolder) ?? "",
      useWikilinks: links?.useWikilinks !== false,
      format: linkFormat(links?.newLinkFormat),
      ext: params.ext,
      bytes,
      vaultPaths: located.vault.index.files().map((file) => file.path),
    });
    if (!saved) {
      const error = "Could not save the attachment.";
      ctx.dialogs.error(error);
      return { ok: false, error };
    }
    return { ok: true, embed: saved.embed, path: saved.path };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not save the attachment.";
    ctx.dialogs.error(message);
    return { ok: false, error: message };
  }
}

function linkFormat(value: unknown): "shortest" | "relative" | "absolute" {
  return value === "relative" || value === "absolute" ? value : "shortest";
}

