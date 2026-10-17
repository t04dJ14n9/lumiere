import type { Plugin } from "@workshop/core";
import type {
  Dialogs,
  FileTextEdits,
  HostDocuments,
  HostServices,
} from "../../shared/host";
import type { Vault, Vaults } from "../vault/api";
import { rewriteLinks } from "./rewrite";
import type { LinkFormat, RewriteContext } from "./rewrite";

/** Rewrites links in other notes when files are renamed in VS Code. */
export const linkUpdatesHost: Plugin = {
  name: "linkUpdates",
  inject: { required: ["settings", "vaults", "hostDocuments", "dialogs"] },
  apply(ctx) {
    ctx.effect(() =>
      ctx.hostDocuments.onWillRename(async (renames) => {
        const resource = renames[0]?.oldUri;
        if (resource) {
          await ctx.settings.effective.prepare(resource);
        }
        const mode = ctx.settings.get<string>(
          "linkUpdates.mode",
          "prompt",
          resource,
        );
        if (mode === "never") {
          return [];
        }
        const edits = await linkEdits(ctx.vaults, ctx, renames);
        if (edits.length === 0) {
          return [];
        }
        if (mode === "prompt" && !(await confirm(ctx.dialogs, edits.length))) {
          return [];
        }
        return edits;
      }),
    );
  },
};

async function confirm(dialogs: Dialogs, files: number): Promise<boolean> {
  const update = "Update Links";
  const answer = await dialogs.ask(
    `Update links in ${files} file${files === 1 ? "" : "s"}?`,
    [update, "Don't Update"],
  );
  return answer === update;
}

/** Edits for every note in the renamed files' vault that links to them. */
async function linkEdits(
  vaults: Vaults,
  host: Pick<HostServices, "settings" | "hostDocuments">,
  renames: readonly { oldUri: string; newUri: string }[],
): Promise<FileTextEdits[]> {
  const first = renames[0] ? await vaults.locate(renames[0].oldUri) : undefined;
  if (!first) {
    return [];
  }
  const { vault } = first;
  const paths = expandFolders(vault, renames);
  if (paths.size === 0) {
    return [];
  }
  const format = host.settings.get<LinkFormat>(
    "links.newLinkFormat",
    "shortest",
    renames[0]?.oldUri,
  );
  const context: RewriteContext = {
    renames: paths,
    resolve: (linkpath, source, syntax) =>
      vault.index.resolveLink(linkpath, source, syntax)?.path,
    pathsAfter: vault.index
      .files()
      .map((file) => paths.get(file.path) ?? file.path),
    format,
    preferredText: (target: string, source: string) =>
      vault.index.describeLink(target, source),
  };
  const sources = new Set<string>(paths.keys());
  for (const path of paths.keys()) {
    vault.index.backlinks(path).forEach((link) => sources.add(link.path));
  }
  const result: FileTextEdits[] = [];
  for (const source of sources) {
    const file = vault.index.file(source);
    if (file?.extension !== "md") {
      continue;
    }
    const edits = rewriteLinks(
      await sourceText(vaults, host.hostDocuments, file.uri),
      source,
      context,
    );
    if (edits.length > 0) {
      result.push({ uri: file.uri, edits });
    }
  }
  return result;
}

/**
 * A note's text as VS Code holds it. An open document can differ from the
 * vault's copy (unsaved edits, or a buffer left over from a closed editor),
 * and the edits apply to that document, so offsets must come from it.
 */
export async function sourceText(
  vaults: Pick<Vaults, "text">,
  documents: Pick<HostDocuments, "text">,
  uri: string,
): Promise<string> {
  return documents.text(uri) ?? (await vaults.text(uri));
}

/**
 * Old → new vault paths for the renamed files in this vault. VS Code
 * reports a folder once, so its files are listed from the index.
 */
function expandFolders(
  vault: Vault,
  renames: readonly { oldUri: string; newUri: string }[],
): Map<string, string> {
  const paths = new Map<string, string>();
  for (const { oldUri, newUri } of renames) {
    const oldPath = vault.pathOf(oldUri);
    const newPath = vault.pathOf(newUri);
    if (oldPath === undefined || newPath === undefined) {
      continue;
    }
    if (vault.index.file(oldPath)) {
      paths.set(oldPath, newPath);
      continue;
    }
    for (const file of vault.index.files()) {
      if (file.path.startsWith(`${oldPath}/`)) {
        paths.set(file.path, newPath + file.path.slice(oldPath.length));
      }
    }
  }
  return paths;
}
