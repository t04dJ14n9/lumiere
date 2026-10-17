import type { Context } from "@workshop/core";
import type { HostServices } from "../../shared/host";
import { MARKDOWN_EDITOR } from "../../shared/editor-provider";
import { contributionId } from "../../shared/setting-schema";

const { viewType, filenamePatterns: markdownPatterns } = MARKDOWN_EDITOR;

/**
 * The workspace's editor associations with Markdown routed to this editor.
 * Other patterns are kept; a value that is not an association map (an old
 * array form, or a hand-edited mistake) is replaced.
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
    associations[pattern] = viewType;
  }
  return associations;
}

function opensMarkdownHere(existing: unknown): boolean {
  return (
    !!existing &&
    typeof existing === "object" &&
    markdownPatterns.every(
      (pattern) => (existing as Record<string, unknown>)[pattern] === viewType,
    )
  );
}

/**
 * DESIGN §25.2: the editor is an option for `*.md` so that it does not take
 * over every README; this makes it the default for one workspace, as a vault.
 */
export async function useForMarkdownInWorkspace(
  host: Pick<HostServices, "settings" | "dialogs">,
): Promise<void> {
  const associations = host.settings.editorAssociations;
  const existing = associations.read();
  if (existing === undefined) {
    host.dialogs.error(
      "Open a folder or workspace first: the association is saved in the workspace settings.",
    );
    return;
  }
  if (opensMarkdownHere(existing)) {
    host.dialogs.inform(
      "Markdown files in this workspace already open in Markdown Workshop.",
    );
    return;
  }
  await associations.write(withMarkdownWorkshop(existing));
  host.dialogs.inform(
    "Markdown files in this workspace now open in Markdown Workshop. Use Open as Text or Reopen Editor With… for the text editor.",
  );
}

export function registerMarkdownAssociation(ctx: Context): void {
  ctx.effect(() =>
    ctx.hostCommands.register(contributionId("useForMarkdownInWorkspace"), () =>
      useForMarkdownInWorkspace(ctx),
    ),
  );
}
