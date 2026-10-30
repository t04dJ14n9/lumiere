import type { Context } from "@workshop/core";
import type { HostServices } from "../../shared/host";
import {
  MARKDOWN_EDITOR,
  MARKDOWN_WORKSPACE_EDITOR_KEY,
} from "../../shared/editor-provider";
import { contributionId } from "../../shared/setting-schema";

const { viewType, filenamePatterns: markdownPatterns } = MARKDOWN_EDITOR;
const NATIVE_TEXT_EDITOR = "default";

/**
 * Route Markdown through VS Code's text editor so Search can expose its range;
 * reclaim immediately transfers that tab to Lumière. Other patterns are kept.
 */
export function withMarkdownWorkshop(
  existing: unknown,
): Record<string, string> {
  const associations: Record<string, string> = {};
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    for (const [pattern, editor] of Object.entries(existing)) {
      if (typeof editor === "string") {
        associations[pattern] = editor;
      }
    }
  }
  for (const pattern of markdownPatterns) {
    associations[pattern] = NATIVE_TEXT_EDITOR;
  }
  return associations;
}

function opensMarkdownHere(
  existing: unknown,
  storage: HostServices["storage"],
): boolean {
  return (
    storage.get(MARKDOWN_WORKSPACE_EDITOR_KEY, false) &&
    !!existing &&
    typeof existing === "object" &&
    markdownPatterns.every(
      (pattern) =>
        (existing as Record<string, unknown>)[pattern] === NATIVE_TEXT_EDITOR,
    )
  );
}

function directlyOpensMarkdown(existing: unknown): boolean {
  if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
    return false;
  }
  const associations = existing as Record<string, unknown>;
  // A workspace often records only `*.md`. Either pattern is the old route.
  return markdownPatterns.some((pattern) => associations[pattern] === viewType);
}

async function migrateDirectAssociation(
  host: Pick<HostServices, "settings" | "storage">,
): Promise<void> {
  const existing = host.settings.editorAssociations.read();
  if (!directlyOpensMarkdown(existing)) {
    return;
  }
  await host.storage.update(MARKDOWN_WORKSPACE_EDITOR_KEY, true);
  await host.settings.editorAssociations.write(withMarkdownWorkshop(existing));
}

/**
 * DESIGN §25.2: the editor is an option for `*.md` so that it does not take
 * over every README; this records it as the default for one workspace.
 */
export async function useForMarkdownInWorkspace(
  host: Pick<HostServices, "settings" | "dialogs" | "storage">,
): Promise<void> {
  const associations = host.settings.editorAssociations;
  const existing = associations.read();
  if (existing === undefined) {
    host.dialogs.error(
      "Open a folder or workspace first: the association is saved in the workspace settings.",
    );
    return;
  }
  if (opensMarkdownHere(existing, host.storage)) {
    host.dialogs.inform(
      "Markdown files in this workspace already open in Lumière.",
    );
    return;
  }
  await host.storage.update(MARKDOWN_WORKSPACE_EDITOR_KEY, true);
  await associations.write(withMarkdownWorkshop(existing));
  host.dialogs.inform(
    "Markdown files in this workspace now open in Lumière. Use Open as Text or Reopen Editor With… for the text editor.",
  );
}

export function registerMarkdownAssociation(ctx: Context): void {
  ctx.track(migrateDirectAssociation(ctx));
  ctx.effect(() =>
    ctx.hostCommands.register(contributionId("useForMarkdownInWorkspace"), () =>
      useForMarkdownInWorkspace(ctx),
    ),
  );
}
