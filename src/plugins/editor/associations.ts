import type { Context } from "../../kernel";
import type { Workbench } from "../../shared/runtime";
import { MARKDOWN_EDITOR } from "../../shared/editor-provider";

const { viewType, filenamePatterns: markdownPatterns } = MARKDOWN_EDITOR;

/**
 * The workspace's editor associations with Markdown routed to this editor.
 * Other patterns are kept; a value that is not an association map (an old
 * array form, or a hand-edited mistake) is replaced.
 */
export function withMarkdownWorkbench(
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
  workbench: Workbench,
): Promise<void> {
  const existing = workbench.editorAssociations?.read();
  if (!workbench.editorAssociations || existing === undefined) {
    workbench.error(
      "Open a folder or workspace first: the association is saved in the workspace settings.",
    );
    return;
  }
  if (opensMarkdownHere(existing)) {
    workbench.inform?.(
      "Markdown files in this workspace already open in Markdown Workshop.",
    );
    return;
  }
  await workbench.editorAssociations.write(withMarkdownWorkbench(existing));
  workbench.inform?.(
    "Markdown files in this workspace now open in Markdown Workshop. Use Open as Text or Reopen Editor With… for the text editor.",
  );
}

export function registerMarkdownAssociation(ctx: Context): void {
  ctx.effect(() =>
    ctx.workbench.command("markdownWorkbench.useForMarkdownInWorkspace", () =>
      useForMarkdownInWorkspace(ctx.workbench),
    ),
  );
}
