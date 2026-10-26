/**
 * The sketch plugin's host half, once per window: Insert Sketch, and the
 * edits each note's page asks for when a sketch is tapped. It needs a
 * canvas (`ink`), so it runs only where the host has one (the iPad); the
 * pages elsewhere leave sketches to show as images.
 */
import type { Context, Plugin, PluginHandle } from "@workshop/core";
import type {} from "@workshop/ink/service";
import { registerReportedCommands } from "../../shared/reported-command";
import { contributionId } from "../../shared/setting-schema";
import { asString } from "../../shared/values";
import type { EditorPanel } from "../editor/api";
import type {} from "../vault/api";
import { editSketch, type SketchHost } from "./edit";
import { insertSketch } from "./insert";
import { CAN_DRAW } from "./manifest";
import { protocol } from "./protocol";

export const sketchHost: Plugin = {
  name: "sketch",
  inject: {
    required: [
      "ink",
      "editors",
      "vaults",
      "hostCommands",
      "hostDocuments",
      "workspace",
      "settings",
      "dialogs",
    ],
  },
  apply(ctx) {
    registerInsertSketch(ctx);
    answerNotePages(ctx);
    showInMenus(ctx);
  },
};

function sketchHostOf(ctx: Context): SketchHost {
  return {
    ink: ctx.ink,
    files: ctx.workspace.files,
    vaults: ctx.vaults,
    error: (message) => ctx.dialogs.error(message),
  };
}

function registerInsertSketch(ctx: Context): void {
  registerReportedCommands(
    (setup) => ctx.effect(setup),
    ctx.hostCommands,
    (message) => ctx.dialogs.error(message),
    [{ id: contributionId("insertSketch"), run: () => insertIntoActive(ctx) }],
  );
}

async function insertIntoActive(ctx: Context): Promise<void> {
  const panel = ctx.editors.active();
  if (!panel) {
    ctx.dialogs.error("Open a note to insert a sketch.");
    return;
  }
  const snapshot = await ctx.editors.capture(panel.id).catch(() => undefined);
  const links = ctx.settings.forNote(panel.document).features?.links?.config;
  await insertSketch(
    {
      ...sketchHostOf(ctx),
      apply: (document, edits) => ctx.hostDocuments.apply(document, edits),
      now: () => new Date(),
    },
    {
      document: panel.document,
      ...(snapshot ? { caret: snapshot.state.head } : {}),
      links: {
        attachmentFolder: asString(links?.attachmentFolder) ?? "",
        useWikilinks: links?.useWikilinks !== false,
        format: linkFormat(links?.newLinkFormat),
      },
    },
  );
}

function linkFormat(value: unknown): "shortest" | "relative" | "absolute" {
  return value === "relative" || value === "absolute" ? value : "shortest";
}

/** Each note's page asks here; a page opened before this started is told it can. */
function answerNotePages(ctx: Context): void {
  const pages = new Map<string, PluginHandle>();
  const bind = (panel: EditorPanel) => {
    const fiber = ctx.plugin({
      name: `sketch:${panel.id}`,
      apply(owned) {
        owned.effect(() => panel.rpc.handle(protocol, "available", () => true));
        owned.effect(() =>
          panel.rpc.handle(protocol, "edit", (embed) =>
            editSketch(sketchHostOf(ctx), panel.document.uri, embed),
          ),
        );
        try {
          panel.rpc.notify(protocol, "ready", {});
        } catch (error) {
          // A page not listening yet asks for itself (`available`).
          ctx.logger.debug("Sketch page not told it can draw", error);
        }
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

/** Insert Sketch shows in the right-click menu only while this runs. */
function showInMenus(ctx: Context): void {
  // Kept for the cleanup, which runs once the context no longer lends services.
  const commands = ctx.hostCommands;
  const set = async (value: boolean): Promise<void> => {
    try {
      await commands.execute("setContext", CAN_DRAW, value);
    } catch (error) {
      ctx.logger.warn("Could not show Insert Sketch", error);
    }
  };
  ctx.effect(() => {
    void set(true);
    return () => set(false);
  });
}
