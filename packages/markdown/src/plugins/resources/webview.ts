import type { Plugin } from "@workshop/core";
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
    const cache = new Map<string, Resource>();

    const getCached = (key: string): Resource | undefined => {
      const cached = cache.get(key);
      if (cached !== undefined) {
        cache.delete(key);
        cache.set(key, cached);
      }
      return cached;
    };

    const setCached = (key: string, resource: Resource): void => {
      if (cache.has(key)) {
        cache.delete(key);
      } else if (cache.size >= RESOURCE_CACHE_LIMIT) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) {
          cache.delete(oldest);
        }
      }
      cache.set(key, resource);
    };

    ctx.effect(() => () => {
      cache.clear();
    });

    ctx.provide("resources", {
      peek: (target, source, syntax) =>
        getCached(makeResourceKey(target, source, syntax)),
      load: async (target, source, syntax) => {
        const key = makeResourceKey(target, source, syntax);
        const cached = getCached(key);
        if (cached !== undefined) {
          return cached;
        }
        const resolved = await ctx.rpc.call(protocol, "load", {
          target,
          ...(source === undefined ? {} : { source }),
          ...(syntax === undefined ? {} : { syntax }),
        });
        if (isCacheableResource(resolved)) {
          setCached(key, resolved);
        }
        return resolved;
      },
    });
  },
};
