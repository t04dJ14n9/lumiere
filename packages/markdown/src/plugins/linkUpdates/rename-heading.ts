import type { Context } from "@workshop/core";
import { SourceCoordinates } from "../../shared/document/coordinates";
import type { Dialogs, HostDocuments } from "../../shared/host";
import type { Editors } from "../editor/api";
import { protocol as editorProtocol } from "../editor/protocol";
import type { Vaults } from "../vault/api";
import {
  headingAt,
  headingLinkEdits,
  type RenamedHeading,
} from "./heading-rename";
import { sourceText } from "./source-text";
import { contributionId } from "../../shared/setting-schema";

interface Services {
  /** Undefined when the window has no Lumière editors. */
  editors: Editors | undefined;
  dialogs: Dialogs;
  vaults: Vaults;
  hostDocuments: HostDocuments;
}

/** Characters that would break a `[[Note#Heading]]` link to the heading. */
const BREAKS_LINKS = /[#|^[\]]/u;

/** Why a new heading name will not do, or undefined when it will. */
export function headingNameProblem(value: string): string | undefined {
  if (!value.trim()) {
    return "A heading needs a name.";
  }
  return BREAKS_LINKS.test(value)
    ? "A heading name cannot contain # | ^ [ or ]."
    : undefined;
}

/**
 * Obsidian's Rename heading: rename the heading at the caret in the active
 * note, and update every link to it, in the note and in the notes linking to
 * it (through the vault's backlinks).
 */
export async function renameHeading(ctx: Services): Promise<void> {
  const panel = ctx.editors?.active();
  const caret = await panel?.rpc
    .call(editorProtocol, "captureSelection", {})
    .catch(() => undefined);
  const text = panel?.document.getText() ?? "";
  const heading =
    caret && headingAt(text, new SourceCoordinates(text).toSource(caret.from));
  if (!panel || !heading) {
    ctx.dialogs.inform("Put the caret on a heading to rename it.");
    return;
  }
  const name = (
    await ctx.dialogs.input({
      prompt: "Rename heading",
      value: heading.name,
      validate: headingNameProblem,
    })
  )?.trim();
  const located = await ctx.vaults.locate(panel.document.uri);
  const path = located?.vault.pathOf(panel.document.uri);
  if (!name || name === heading.name || !located || path === undefined) {
    return;
  }
  const renamed: RenamedHeading = { path, text, heading, name };
  await updateLinks(ctx, located.vault, renamed);
  await ctx.hostDocuments.apply(panel.document, [
    { from: heading.nameFrom, to: heading.nameTo, insert: name },
    ...headingLinkEdits(text, path, renamed, resolver(located.vault)),
  ]);
}

type Vault = NonNullable<Awaited<ReturnType<Vaults["locate"]>>>["vault"];

function resolver(vault: Vault) {
  return (linkpath: string, source: string, syntax: "wikilink" | "markdown") =>
    vault.index.resolveLink(linkpath, source, syntax)?.path;
}

/** Update the links to the heading in every other note that links here. */
async function updateLinks(
  ctx: Services,
  vault: Vault,
  renamed: RenamedHeading,
): Promise<void> {
  const sources = new Set(
    vault.index.backlinks(renamed.path).map((link) => link.path),
  );
  sources.delete(renamed.path);
  for (const source of sources) {
    const file = vault.index.file(source);
    if (file?.extension !== "md") {
      continue;
    }
    const text = await sourceText(ctx.vaults, ctx.hostDocuments, file.uri);
    const edits = headingLinkEdits(text, source, renamed, resolver(vault));
    if (edits.length > 0) {
      await ctx.hostDocuments.apply(
        await ctx.hostDocuments.open(file.uri),
        edits,
      );
    }
  }
}

/** Register the command; it reads the active editor when it runs. */
export function registerRenameHeading(ctx: Context, services: Services): void {
  ctx.effect(() =>
    ctx.hostCommands.register(contributionId("renameHeading"), () =>
      renameHeading(services),
    ),
  );
}
