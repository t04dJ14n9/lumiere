import { frontmatter } from "../../markdown/properties";
import type { Context, Disposer, Plugin } from "../../kernel";
import { registerReportedCommands } from "../../shared/reported-command";
import type { HostDocument } from "../../shared/runtime";
import { asString, asStrings } from "../../shared/values";
import { baseName, containingFolder } from "../../shared/workspace-path";
import type { ResolvedLayout, WikiLayout } from "../wiki/api";
import { createScratchNote, promoteScratchNote } from "./run";
import { PROMOTE_TARGETS } from "./template";

/** Temporary notes outside the bundle, promoted only by an explicit command. */
export const scratchHost: Plugin = {
  name: "scratch",
  inject: { required: ["workbench"], optional: ["editors", "wikiLayout"] },
  apply(ctx) {
    const views = ctx.workbench.views;
    if (!views || typeof ctx.workbench.files?.readText !== "function") {
      return;
    }
    const effect = (setup: () => Disposer) => {
      ctx.effect(setup);
    };
    const report = (message: string) => ctx.workbench.error(message);
    registerReportedCommands(effect, views, report, [
      { id: "markdownWorkbench.scratch.new", run: () => newScratch(ctx) },
      {
        id: "markdownWorkbench.scratch.promote",
        run: () => promote(ctx),
      },
    ]);
  },
};

async function newScratch(ctx: Context): Promise<void> {
  const views = ctx.workbench.views;
  const located = locate(ctx);
  if (!views || !located || !ctx.workbench.files) {
    ctx.workbench.error("Open a folder before creating a scratch note.");
    return;
  }
  const title = await views.input({
    prompt: "Scratch note title",
    value: "Untitled",
    validate: (value) => (value.trim() ? undefined : "Enter a title."),
  });
  if (typeof title !== "string" || title.trim() === "") {
    return;
  }
  await createScratchNote(io(ctx, located), {
    title: title.trim(),
    at: new Date().toISOString(),
    folder: scratchFolder(
      located.layout,
      views.setting("scratch.folder", "scratch"),
    ),
  });
}

async function promote(ctx: Context): Promise<void> {
  const views = ctx.workbench.views;
  const note = await openNote(ctx);
  const located = note ? locate(ctx, note.uri) : undefined;
  if (!views || !note || !located?.relative || !ctx.workbench.files) {
    ctx.workbench.error(
      "Save the scratch note into the project before promoting it.",
    );
    return;
  }
  const picked = await views.pick({
    placeholder: "Promote this scratch note into the wiki",
    items: () =>
      PROMOTE_TARGETS.map((target) => ({
        label: target.type,
        description: target.logical,
        value: target,
      })),
  });
  if (!picked?.item) {
    return;
  }
  const values = frontmatter(note.text)?.values;
  const titled = asString(values?.title)?.trim();
  await promoteScratchNote(io(ctx, located), {
    target: picked.item.value,
    title: titled || baseName(located.relative).replace(/\.md$/i, ""),
    text: note.text,
    at: new Date().toISOString(),
    scratchRelative: located.relative,
    document: note.document,
  });
}

function scratchFolder(
  layout: ResolvedLayout | undefined,
  setting: unknown,
): string {
  if (layout) {
    return layout.scratch;
  }
  const configured = asString(setting);
  return configured || "scratch";
}

function locate(ctx: Context, uri?: string) {
  const roots = asStrings(ctx.workbench.workspaceFolders?.());
  const found = uri ? containingFolder(uri, roots) : undefined;
  const root = found?.root ?? roots[0];
  if (!root) {
    return undefined;
  }
  const layout = usableLayout(ctx.wikiLayout)?.projectFor(uri ?? root)?.layout;
  return {
    root,
    ...(layout ? { layout } : {}),
    ...(found ? { relative: found.relative } : {}),
  };
}

function usableLayout(layout: WikiLayout | undefined): WikiLayout | undefined {
  if (!layout || typeof layout.projectFor !== "function") {
    return undefined;
  }
  return layout;
}

function io(ctx: Context, located: { root: string; layout?: ResolvedLayout }) {
  const files = ctx.workbench.files;
  if (!files) {
    throw new Error("Workspace files are unavailable.");
  }
  return {
    files,
    rootUri: located.root,
    ...(located.layout ? { layout: located.layout } : {}),
    execute: (id: string, ...args: unknown[]) =>
      ctx.workbench.execute(id, ...args),
    apply: (
      document: HostDocument,
      edits: Parameters<Context["workbench"]["apply"]>[1],
    ) => ctx.workbench.apply(document, edits),
    inform: (message: string) => ctx.workbench.inform?.(message),
    error: (message: string) => ctx.workbench.error(message),
  };
}

async function openNote(
  ctx: Context,
): Promise<{ uri: string; text: string; document: HostDocument } | undefined> {
  const panel = ctx.editors?.active();
  if (!panel || typeof panel.document?.getText !== "function") {
    return undefined;
  }
  const text = panel.document.getText();
  if (typeof text !== "string" || typeof panel.document.uri !== "string") {
    return undefined;
  }
  if (panel.document.uri.startsWith("untitled:")) {
    return undefined;
  }
  return { uri: panel.document.uri, text, document: panel.document };
}
