/**
 * A file a note's page shows, read for the service worker: only from a vault
 * this window has open that holds the page's note, as host-node's routes read
 * only from a panel's own workspace. The page asks by `file:` URI and is not
 * trusted, so the URI is checked here again, whatever the editor checked.
 */
import type { Mounts } from "@workshop/host-web";
import type { Answer } from "./shared/messages";

export interface VaultFilesParts {
  /** The open pages' panels, by id (`host.panels`). */
  readonly panels: {
    get(
      id: string,
    ): { readonly document: { readonly uri: string } } | undefined;
  };
  /** The folders of the vaults this window has open (`/vaults/Notes`). */
  readonly vaults: () => readonly string[];
  readonly files: Pick<Mounts, "uriOf" | "isInside" | "stat" | "readBlob">;
}

/** The file `uri` for the page of panel `panel`, if it may read it. */
export async function vaultFile(
  parts: VaultFilesParts,
  request: { readonly panel: string; readonly uri: string },
): Promise<Answer> {
  const panel = parts.panels.get(request.panel);
  if (!panel) {
    return { kind: "unknown" };
  }
  const { files } = parts;
  const note = panel.document.uri;
  // Containment is by path: the URI parser has resolved `..`, and an
  // encoded separator is refused (host-node's uriPath).
  const inNotesVault = parts
    .vaults()
    .map((folder) => files.uriOf(folder))
    .some(
      (root) => files.isInside(root, note) && files.isInside(root, request.uri),
    );
  if (!inNotesVault) {
    return { kind: "refused" };
  }
  if ((await files.stat(request.uri))?.kind !== "file") {
    return { kind: "missing" };
  }
  const file = await files.readBlob(request.uri).catch(() => undefined);
  return file ? { kind: "file", file } : { kind: "missing" };
}
