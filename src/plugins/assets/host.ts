import type { Context, Disposer, Plugin } from "../../kernel";
import { registerReportedCommands } from "../../shared/reported-command";
import { contributionId } from "../../shared/setting-schema";
import { asString, asStrings } from "../../shared/values";
import type { HostDocument } from "../../shared/runtime";
import { containingFolder } from "../../shared/workspace-path";
import type { WikiLayout } from "../wiki/api";
import { importAsset } from "./run";

/** Imports a file into the configured assets folder and inserts a portable link. */
export const assetsHost: Plugin = {
  name: "assets",
  inject: { required: ["workbench"], optional: ["editors", "wikiLayout"] },
  apply(ctx) {
    const views = ctx.workbench.views;
    if (!views || typeof ctx.workbench.files?.readText !== "function") {
      return;
    }
    const effect = (setup: () => Disposer) => {
      ctx.effect(setup);
    };
    registerReportedCommands(
      effect,
      views,
      (message) => ctx.workbench.error(message),
      [
        {
          id: contributionId("assets.import"),
          run: () => importIntoProject(ctx),
        },
      ],
    );
  },
};

async function importIntoProject(ctx: Context): Promise<void> {
  const files = ctx.workbench.files;
  const views = ctx.workbench.views;
  if (!files || !views) {
    return;
  }
  const sourceUri = await files.pickFile("Import an asset");
  if (typeof sourceUri !== "string") {
    return;
  }
  const destination = await assetDestination(ctx, views);
  if (!destination) {
    ctx.workbench.error("Open a folder before importing an asset.");
    return;
  }
  await importAsset({
    files,
    sourceUri,
    ...destination,
    ask: (message, actions) => views.ask(message, actions),
    apply: (document, edits) => ctx.workbench.apply(document, edits),
    clipboardWrite: (text) => ctx.workbench.clipboard.write(text),
    inform: (message) => ctx.workbench.inform?.(message),
    error: (message) => ctx.workbench.error(message),
  });
}

async function assetDestination(
  ctx: Context,
  views: NonNullable<Context["workbench"]["views"]>,
) {
  const note = await activeDocument(ctx);
  const roots = asStrings(ctx.workbench.workspaceFolders?.());
  const folder = note ? containingFolder(note.uri, roots) : undefined;
  const rootUri = folder?.root ?? roots[0];
  if (!rootUri) {
    return undefined;
  }
  const layout = wikiLayout(ctx.wikiLayout)?.projectFor(
    noteUri(note) ?? rootUri,
  )?.layout;
  return {
    rootUri,
    assetsPath: assetsFolder(layout?.assets, views.setting("assets.path", "")),
    ...(layout?.bundle ? { bundle: layout.bundle } : {}),
    ...(folder ? { notePath: folder.relative } : {}),
    ...(await noteFields(ctx, note)),
  };
}

function noteUri(note: HostDocument | undefined): string | undefined {
  return note?.uri;
}

async function noteFields(ctx: Context, note: HostDocument | undefined) {
  if (!note) {
    return {};
  }
  const caret = await caretOf(ctx, note);
  return {
    noteText: note.getText(),
    document: note,
    ...(typeof caret === "number" ? { caret } : {}),
  };
}

function assetsFolder(
  layoutPath: string | undefined,
  setting: unknown,
): string {
  if (layoutPath) {
    return layoutPath;
  }
  const configured = asString(setting);
  return configured ? configured : "assets";
}

function wikiLayout(layout: WikiLayout | undefined): WikiLayout | undefined {
  if (!layout || typeof layout.projectFor !== "function") {
    return undefined;
  }
  return layout;
}

async function activeDocument(ctx: Context): Promise<HostDocument | undefined> {
  const panel = ctx.editors?.active();
  if (panel && typeof panel.document?.getText === "function") {
    const text = panel.document.getText();
    if (typeof text === "string" && typeof panel.document.uri === "string") {
      return panel.document;
    }
  }
  return undefined;
}

async function caretOf(
  ctx: Context,
  document: HostDocument,
): Promise<number | undefined> {
  const capture = ctx.editors?.capture;
  const panel = ctx.editors?.active();
  if (
    !panel ||
    panel.document.uri !== document.uri ||
    typeof capture !== "function"
  ) {
    return undefined;
  }
  const snapshot = await capture(panel.id).catch(() => undefined);
  const head = snapshot?.state?.head;
  return typeof head === "number" ? head : undefined;
}
