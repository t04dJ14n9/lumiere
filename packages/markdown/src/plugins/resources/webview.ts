import type { Plugin } from "@workshop/core";
import { RecentlyUsed } from "../../shared/recently-used";
import type { LinkSyntax } from "../../shared/vault-path";
import type { Resource } from "./api";
import { protocol } from "./protocol";

const RESOURCE_CACHE_LIMIT = 256;

function isCacheableResource(resource: Resource): boolean {
  return resource.kind !== "note" && resource.kind !== "base";
}

function makeResourceKey(
  target: string,
  source?: string,
  syntax?: LinkSyntax,
): string {
  return `${syntax ?? "markdown"}\0${source ?? ""}\0${target}`;
}

export const resourcesWebview: Plugin = {
  name: "resources",
  inject: { required: ["rpc"] },
  provides: ["resources"],
  apply(ctx) {
    const cache = new RecentlyUsed<string, Resource>(RESOURCE_CACHE_LIMIT);

    ctx.effect(() => () => {
      cache.clear();
    });
    // Each URL carries the file's mtime when it was resolved (`?v=`), so a
    // rewritten file needs resolving again to show.
    ctx.on("resources/changed", () => cache.clear());

    ctx.provide("resources", {
      peek: (target, source, syntax) =>
        cache.get(makeResourceKey(target, source, syntax)),
      load: async (target, source, syntax) => {
        const key = makeResourceKey(target, source, syntax);
        const cached = cache.get(key);
        if (cached !== undefined) {
          return cached;
        }
        const resolved = await ctx.rpc.call(protocol, "load", {
          target,
          ...(source === undefined ? {} : { source }),
          ...(syntax === undefined ? {} : { syntax }),
        });
        if (isCacheableResource(resolved)) {
          cache.set(key, resolved);
        }
        return resolved;
      },
    });
  },
};
