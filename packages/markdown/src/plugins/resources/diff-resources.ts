import type { Plugin } from "@workshop/core";
import type { DiffSide, GitAccess } from "../../shared/git";
import type { Vaults } from "../vault/api";
import type { HostServices } from "../../shared/host";
import { NoteResources } from "./note-resources";

import type {} from "./api";
/** Reuse vault resolution and containment for independently owned diff sides. */
export const diffResourcesHost: Plugin = {
  name: "resources",
  inject: { required: ["vaults", "workspace", "hostDocuments", "git"] },
  provides: ["diffResources"],
  apply(ctx) {
    ctx.provide("diffResources", {
      forSide: (side) => sideResources(ctx.vaults, ctx, side),
    });
  },
};

export async function sideResources(
  vaults: Vaults,
  host: Pick<HostServices, "workspace" | "hostDocuments"> & { git: GitAccess },
  side: DiffSide,
) {
  const { source, ref } = host.git.sourceOf(side.uri);
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
