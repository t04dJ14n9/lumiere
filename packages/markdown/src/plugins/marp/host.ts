import type { Context, Disposer, Plugin } from "@workshop/core";
import { isMarpDocument } from "../../markdown/marp";
import { registerReportedCommands } from "../../shared/reported-command";
import { contributionId } from "../../shared/setting-schema";
import type { HostDocument } from "../../shared/host";
import { asString, asStrings } from "../../shared/values";
import { containingFolder } from "../../shared/workspace-path";
import type { PanelPort } from "../../shared/host";
import type { WikiLayout } from "../wiki/api";
import {
  MARP_EXTENSION,
  exportDeck,
  keepDeck,
  moveDeckOutside,
  previewDeck,
  redirectToTextEditor,
  toggleMarp,
} from "./actions";
import type { MarpActions } from "./actions";

/** Detects Marp decks and bridges preview and export. It does not render themes. */
export const marpHost: Plugin = {
  name: "marp",
  inject: {
    required: [
      "hostDocuments",
      "hostCommands",
      "clipboard",
      "dialogs",
      "settings",
      "workspace",
      "storage",
      "extensions",
      "activeEditor",
    ],
    optional: ["editors", "wikiLayout"],
  },
  apply(ctx) {
    const effect = (setup: () => Disposer) => {
      ctx.effect(setup);
    };
    const report = (message: string) => ctx.dialogs.error(message);
    registerReportedCommands(effect, ctx.hostCommands, report, [
      { id: contributionId("marp.preview"), run: () => previewActive(ctx) },
      { id: contributionId("marp.export"), run: () => exportActive(ctx) },
      { id: contributionId("marp.toggle"), run: () => toggleActive(ctx) },
      {
        id: contributionId("marp.moveOutside"),
        run: () => moveActive(ctx),
      },
      {
        id: contributionId("marp.keepInWorkshop"),
        run: () => keepActive(ctx),
      },
    ]);
    ctx.on("editor/opened", (panel) => {
      consider(ctx, panel);
    });
    ctx.on("editor/activeChanged", () => {
      publishMarp(ctx);
    });
    ctx.effect(() => ctx.activeEditor.onNoteChanged(() => publishMarp(ctx)));
    ctx.effect(() => ctx.hostDocuments.onChange(() => publishMarp(ctx)));
    // Captured while live: teardown runs after this context is disposed.
    const commands = ctx.hostCommands;
    ctx.effect(() => async () => {
      await commands.execute("setContext", contributionId("isMarp"), false);
    });
    publishMarp(ctx);
  },
};

function consider(ctx: Context, panel: PanelPort): void {
  const note = noteFrom(panel);
  publishMarp(ctx);
  if (!note) {
    return;
  }
  const mode = ctx.settings.get("marp.open", "workbench");
  if (
    !redirectToTextEditor({
      mode,
      text: note.text,
      uri: note.uri,
      storage: ctx.storage,
    })
  ) {
    return;
  }
  void ctx.hostCommands
    .execute("vscode.openWith", note.uri, "default")
    .catch((error: unknown) => {
      ctx.dialogs.error(
        error instanceof Error
          ? error.message
          : "Could not open the text editor.",
      );
    });
}

function publishMarp(ctx: Context): void {
  const text = activeNote(ctx)?.text;
  const isMarp = typeof text === "string" && isMarpDocument(text);
  void ctx.hostCommands
    .execute("setContext", contributionId("isMarp"), isMarp)
    .catch(() => undefined);
}

async function previewActive(ctx: Context): Promise<void> {
  const note = activeNote(ctx);
  if (!note) {
    ctx.dialogs.error("Open a Markdown note to preview it.");
    return;
  }
  await previewDeck(actions(ctx), note.uri);
}

async function exportActive(ctx: Context): Promise<void> {
  const note = activeNote(ctx);
  if (!note) {
    ctx.dialogs.error("Open a Marp deck to export it.");
    return;
  }
  await exportDeck(actions(ctx), note.uri);
}

async function toggleActive(ctx: Context): Promise<void> {
  const note = activeNote(ctx);
  if (!note) {
    ctx.dialogs.error("Open a Markdown note to toggle Marp.");
    return;
  }
  await toggleMarp(actions(ctx), note.document);
}

async function keepActive(ctx: Context): Promise<void> {
  const note = activeNote(ctx);
  if (!note) {
    ctx.dialogs.error("Open a Marp deck to keep it in Markdown Workshop.");
    return;
  }
  await keepDeck(actions(ctx), note.uri);
}

async function moveActive(ctx: Context): Promise<void> {
  const note = activeNote(ctx);
  const roots = asStrings(ctx.workspace.folders());
  const folder = note ? containingFolder(note.uri, roots) : undefined;
  if (!note || !folder) {
    ctx.dialogs.error("Open a Marp deck in a workspace folder.");
    return;
  }
  const place = usableWiki(ctx.wikiLayout)?.place(note.uri);
  await moveDeckOutside(actions(ctx), {
    rootUri: folder.root,
    relativePath: folder.relative,
    ...(place?.project.layout.bundle
      ? { bundle: place.project.layout.bundle }
      : {}),
    exportsPath: place?.project.layout.exports ?? "exports",
    text: note.text,
    sourceUri: note.uri,
    dirty: note.document.isDirty === true,
  });
}

function actions(ctx: Context): MarpActions {
  const { workspace, storage } = ctx;
  return {
    files: workspace.files,
    storage,
    execute: (id, ...args) => ctx.hostCommands.execute(id, ...args),
    reveal: (uri) => workspace.revealTextEditor(uri),
    apply: (document, edits) => ctx.hostDocuments.apply(document, edits),
    ask: (message, choices) => ask(ctx, message, choices),
    clipboardWrite: (text) => ctx.clipboard.write(text),
    inform: (message) => ctx.dialogs.inform(message),
    error: (message) => ctx.dialogs.error(message),
    trusted: () => ctx.workspace.isTrusted(),
    marpInstalled: () => ctx.extensions.isInstalled(MARP_EXTENSION) === true,
  };
}

function ask(
  ctx: Context,
  message: string,
  choices: readonly string[],
): Promise<string | undefined> {
  return ctx.dialogs.ask(message, choices);
}

function usableWiki(layout: WikiLayout | undefined): WikiLayout | undefined {
  if (!layout || typeof layout.place !== "function") {
    return undefined;
  }
  return layout;
}

interface OpenMarpNote {
  readonly uri: string;
  readonly text: string;
  readonly document: HostDocument;
}

function activeNote(ctx: Context): OpenMarpNote | undefined {
  return noteFrom(ctx.editors?.active());
}

function noteFrom(panel: PanelPort | undefined): OpenMarpNote | undefined {
  if (!panel || typeof panel.document?.getText !== "function") {
    return undefined;
  }
  const text = panel.document.getText();
  const uri = asString(panel.document.uri);
  if (!uri || typeof text !== "string") {
    return undefined;
  }
  return { uri, text, document: panel.document };
}
