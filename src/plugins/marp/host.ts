import type { Context, Disposer, Plugin } from "../../kernel";
import { isMarpDocument } from "../../markdown/marp";
import { registerReportedCommands } from "../../shared/reported-command";
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
  inject: { required: ["workbench"], optional: ["editors", "wikiLayout"] },
  apply(ctx) {
    const views = ctx.workbench.views;
    if (!views) {
      return;
    }
    const effect = (setup: () => Disposer) => {
      ctx.effect(setup);
    };
    const report = (message: string) => ctx.workbench.error(message);
    registerReportedCommands(effect, views, report, [
      { id: "markdownWorkbench.marp.preview", run: () => previewActive(ctx) },
      { id: "markdownWorkbench.marp.export", run: () => exportActive(ctx) },
      { id: "markdownWorkbench.marp.toggle", run: () => toggleActive(ctx) },
      {
        id: "markdownWorkbench.marp.moveOutside",
        run: () => moveActive(ctx),
      },
      {
        id: "markdownWorkbench.marp.keepInWorkbench",
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
    ctx.effect(() => ctx.workbench.onChange(() => publishMarp(ctx)));
    // Captured while live: teardown runs after this context is disposed.
    const workbench = ctx.workbench;
    ctx.effect(() => async () => {
      await workbench.execute("setContext", "markdownWorkbench.isMarp", false);
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
  const mode = ctx.workbench.views?.setting("marp.open", "workbench");
  if (
    !redirectToTextEditor({
      mode,
      text: note.text,
      uri: note.uri,
      ...(ctx.workbench.storage ? { storage: ctx.workbench.storage } : {}),
    })
  ) {
    return;
  }
  void ctx.workbench
    .execute("vscode.openWith", note.uri, "default")
    .catch((error: unknown) => {
      ctx.workbench.error(
        error instanceof Error
          ? error.message
          : "Could not open the text editor.",
      );
    });
}

function publishMarp(ctx: Context): void {
  const text = activeNote(ctx)?.text;
  const isMarp = typeof text === "string" && isMarpDocument(text);
  void ctx.workbench
    .execute("setContext", "markdownWorkbench.isMarp", isMarp)
    .catch(() => undefined);
}

async function previewActive(ctx: Context): Promise<void> {
  const note = activeNote(ctx);
  if (!note) {
    ctx.workbench.error("Open a Markdown note to preview it.");
    return;
  }
  await previewDeck(actions(ctx), note.uri);
}

async function exportActive(ctx: Context): Promise<void> {
  const note = activeNote(ctx);
  if (!note) {
    ctx.workbench.error("Open a Marp deck to export it.");
    return;
  }
  await exportDeck(actions(ctx), note.uri);
}

async function toggleActive(ctx: Context): Promise<void> {
  const note = activeNote(ctx);
  if (!note) {
    ctx.workbench.error("Open a Markdown note to toggle Marp.");
    return;
  }
  await toggleMarp(actions(ctx), note.document);
}

async function keepActive(ctx: Context): Promise<void> {
  const note = activeNote(ctx);
  if (!note) {
    ctx.workbench.error("Open a Marp deck to keep it in Markdown Workbench.");
    return;
  }
  await keepDeck(actions(ctx), note.uri);
}

async function moveActive(ctx: Context): Promise<void> {
  const note = activeNote(ctx);
  const roots = asStrings(ctx.workbench.workspaceFolders?.());
  const folder = note ? containingFolder(note.uri, roots) : undefined;
  if (!note || !folder) {
    ctx.workbench.error("Open a Marp deck in a workspace folder.");
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
  const reveal = ctx.workbench.revealTextEditor;
  return {
    ...(ctx.workbench.files ? { files: ctx.workbench.files } : {}),
    ...(ctx.workbench.storage ? { storage: ctx.workbench.storage } : {}),
    execute: (id, ...args) => ctx.workbench.execute(id, ...args),
    ...(reveal ? { reveal: (uri: string) => reveal(uri) } : {}),
    apply: (document, edits) => ctx.workbench.apply(document, edits),
    ask: (message, choices) => ask(ctx, message, choices),
    clipboardWrite: (text) => ctx.workbench.clipboard.write(text),
    inform: (message) => ctx.workbench.inform?.(message),
    error: (message) => ctx.workbench.error(message),
    trusted: () => ctx.workbench.isTrusted?.(),
    marpInstalled: () => ctx.workbench.hasExtension?.(MARP_EXTENSION) === true,
  };
}

function ask(
  ctx: Context,
  message: string,
  choices: readonly string[],
): Promise<string | undefined> {
  const views = ctx.workbench.views;
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
