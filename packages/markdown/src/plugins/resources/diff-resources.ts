import { pathToFileURL } from "node:url";
import type { Plugin } from "@workshop/core";
import type { DiffSide } from "../../shared/git";
import type { Vaults } from "../vault/api";
import type { HostServices } from "../../shared/host";
import { NoteResources } from "./note-resources";

import type {} from "./api";
/** Reuse vault resolution and containment for independently owned diff sides. */
export const diffResourcesHost: Plugin = {
  name: "resources",
  inject: { required: ["vaults", "workspace", "hostDocuments", "git"] },
  apply(ctx) {
    ctx.provide("diffResources", {
      forSide: (side) => sideResources(ctx.vaults, ctx, side),
    });
  },
};

export function diffSource(uri: string): { source: string; ref?: string } {
  const parsed = new URL(uri);
  if (parsed.protocol !== "git:") {
    return { source: uri };
  }
  const query = JSON.parse(decodeURIComponent(parsed.search.slice(1))) as {
    path: string;
    ref: string;
  };
  if (typeof query.path !== "string" || typeof query.ref !== "string") {
    throw new Error("Invalid Git source");
  }
  // Git stores filesystem paths, including literal percent signs. Select the
  // path dialect explicitly so drive and UNC paths retain their URI semantics.
  const windows = /^(?:[a-z]:[\\/]|\\\\)/i.test(query.path);
  const source = pathToFileURL(query.path, { windows });
  return { source: source.href, ref: query.ref };
}

export async function sideResources(
  vaults: Vaults,
  host: Pick<HostServices, "workspace" | "hostDocuments" | "git">,
  side: DiffSide,
) {
  const { source, ref } = diffSource(side.uri);
  const vault = await vaults.forDocument(source);
  await vault.settled();
  const resources = new NoteResources({
    source,
    vault: vault.index,
    host,
    resourceUrl: (uri) => uri,
  });
  return {
    root: vault.index.root,
    async load(target: string) {
      const resource = await resources.load(target);
      if (resource.kind !== "image") {
        throw new Error("Resource is not an image");
      }
      if (ref === undefined) {
        return resource.url;
      }
      const revision = host.git.toGitUri(resource.source, ref);
      if (!revision) {
        throw new Error("Image revision unavailable");
      }
      return revision;
    },
  };
}
