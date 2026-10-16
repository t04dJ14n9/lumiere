import type { Context, Disposer, Plugin } from "../../kernel";
import { isMarpDocument } from "../../markdown/marp";
import { registerReportedCommands } from "../../shared/reported-command";
import { contributionId } from "../../shared/setting-schema";
import type { HostDocument } from "../../shared/runtime";
import { asString, asStrings } from "../../shared/values";
import { containingFolder } from "../../shared/workspace-path";
import type { PanelPort } from "../../shared/runtime";
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
  inject: { required: ["workshop"], optional: ["editors", "wikiLayout"] },
  apply(ctx) {
    const views = ctx.workshop.views;
    if (!views) {
      return;
    }
    const effect = (setup: () => Disposer) => {
      ctx.effect(setup);
    };
    const report = (message: string) => ctx.workshop.error(message);
    registerReportedCommands(effect, views, report, [
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
    ctx.effect(() => views.onActiveNoteChanged(() => publishMarp(ctx)));
    ctx.effect(() => ctx.workshop.onChange(() => publishMarp(ctx)));
    // Captured while live: teardown runs after this context is disposed.
    const workshop = ctx.workshop;
    ctx.effect(() => async () => {
      await workshop.execute("setContext", contributionId("isMarp"), false);
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
  const mode = ctx.workshop.views?.setting("marp.open", "workbench");
  if (
    !redirectToTextEditor({
      mode,
      text: note.text,
      uri: note.uri,
      ...(ctx.workshop.storage ? { storage: ctx.workshop.storage } : {}),
    })
  ) {
    return;
  }
  void ctx.workshop
    .execute("vscode.openWith", note.uri, "default")
    .catch((error: unknown) => {
      ctx.workshop.error(
        error instanceof Error
          ? error.message
          : "Could not open the text editor.",
      );
    });
}

function publishMarp(ctx: Context): void {
  const text = activeNote(ctx)?.text;
  const isMarp = typeof text === "string" && isMarpDocument(text);
  void ctx.workshop
    .execute("setContext", contributionId("isMarp"), isMarp)
    .catch(() => undefined);
}

async function previewActive(ctx: Context): Promise<void> {
  const note = activeNote(ctx);
  if (!note) {
    ctx.workshop.error("Open a Markdown note to preview it.");
    return;
  }
  await previewDeck(actions(ctx), note.uri);
}

async function exportActive(ctx: Context): Promise<void> {
  const note = activeNote(ctx);
  if (!note) {
    ctx.workshop.error("Open a Marp deck to export it.");
    return;
  }
  await exportDeck(actions(ctx), note.uri);
}

async function toggleActive(ctx: Context): Promise<void> {
  const note = activeNote(ctx);
  if (!note) {
    ctx.workshop.error("Open a Markdown note to toggle Marp.");
    return;
  }
  await toggleMarp(actions(ctx), note.document);
}

async function keepActive(ctx: Context): Promise<void> {
  const note = activeNote(ctx);
  if (!note) {
    ctx.workshop.error("Open a Marp deck to keep it in Markdown Workshop.");
    return;
  }
  await keepDeck(actions(ctx), note.uri);
}

async function moveActive(ctx: Context): Promise<void> {
  const note = activeNote(ctx);
  const roots = asStrings(ctx.workshop.workspaceFolders?.());
  const folder = note ? containingFolder(note.uri, roots) : undefined;
  if (!note || !folder) {
    ctx.workshop.error("Open a Marp deck in a workspace folder.");
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
  const reveal = ctx.workshop.revealTextEditor;
  return {
    ...(ctx.workshop.files ? { files: ctx.workshop.files } : {}),
    ...(ctx.workshop.storage ? { storage: ctx.workshop.storage } : {}),
    execute: (id, ...args) => ctx.workshop.execute(id, ...args),
    ...(reveal ? { reveal: (uri: string) => reveal(uri) } : {}),
    apply: (document, edits) => ctx.workshop.apply(document, edits),
    ask: (message, choices) => ask(ctx, message, choices),
    clipboardWrite: (text) => ctx.workshop.clipboard.write(text),
    inform: (message) => ctx.workshop.inform?.(message),
    error: (message) => ctx.workshop.error(message),
    trusted: () => ctx.workshop.isTrusted?.(),
    marpInstalled: () => ctx.workshop.hasExtension?.(MARP_EXTENSION) === true,
  };
}

function ask(
  ctx: Context,
  message: string,
  choices: readonly string[],
): Promise<string | undefined> {
  const views = ctx.workshop.views;
  if (!views) {
    return Promise.resolve(undefined);
  }
  return views.ask(message, choices);
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
