/**
 * Where the web view reads a vault file a note shows (an image, a video, an
 * embedded PDF): `_lumiere/vault/<vault id>/<path>`, which the app's router
 * answers from the vault's folder (VaultRouter.swift). A file outside the
 * iPad's vaults has no such address.
 */
import { uriPath } from "@workshop/host-node/core";

/**
 * `vaults` maps each vault's id to the folder host-web mounts it at
 * (`/vaults/<name>`); `base` is the app's own address.
 */
export function vaultFileUrl(
  uri: string,
  vaults: ReadonlyMap<string, string>,
  base: URL | string,
): string | undefined {
  let path: string;
  try {
    path = uriPath(uri);
  } catch {
    return undefined;
  }
  for (const [id, folder] of vaults) {
    if (path.startsWith(`${folder}/`)) {
      const relative = path
        .slice(folder.length + 1)
        .split("/")
        .map(encodeURIComponent)
        .join("/");
      return new URL(
        `_lumiere/vault/${encodeURIComponent(id)}/${relative}`,
        base,
      ).href;
    }
  }
  return undefined;
}
