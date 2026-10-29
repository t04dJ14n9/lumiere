import type { Context, Plugin } from "@workshop/core";
import { detectBundles, owningBundle } from "../../markdown/okf";
import { isMarkdownPath } from "../../shared/vault-path";
import type { Vault } from "../vault/api";
import type { Okf, OkfBundle } from "./api";
import type { OkfFacade } from "./facade";
import { okfLinkPolicy } from "./policy";

export interface OkfCoreConfig {
  facade?: OkfFacade;
}

/** Window service for OKF bundles. It registers the link policy; the vault does not inject it. */
export const okfCoreHost: Plugin<OkfCoreConfig> = {
  name: "okfCore",
  inject: { required: ["settings", "vaults"] },
  provides: ["okf"],
  apply(ctx, config) {
    const bundles = new Map<string, readonly string[]>();
    const service = createService(bundles);
    syncBundles(ctx, bundles);
    publish(ctx, service, config?.facade);
    const stop = ctx.vaults.registerLinkPolicy(
      okfLinkPolicy((root) => bundles.get(root) ?? []),
    );
    ctx.effect(() => stop);
    let pending: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(pending);
      pending = undefined;
      if (syncBundles(ctx, bundles)) {
        ctx.vaults.invalidateLinkResolution();
      }
    };
    // Each refresh reads every file in the vault, and a vault changes once
    // per note it indexes: follow changes once a burst settles. Resolution
    // marks the end of an indexing pass, so it refreshes at once.
    ctx.on("vault/changed", () => {
      pending ??= setTimeout(refresh, BUNDLE_SYNC_MS);
    });
    ctx.on("vault/resolved", refresh);
    ctx.effect(() => ctx.settings.onChange(refresh));
    ctx.effect(() => () => clearTimeout(pending));
  },
};

/** How long note changes may settle before OKF bundles follow them. */
export const BUNDLE_SYNC_MS = 300;

function publish(
  ctx: Context,
  service: Okf,
  facade: OkfFacade | undefined,
): void {
  facade?.bind(service);
  ctx.provide("okf", facade ?? service);
  ctx.effect(() => () => facade?.bind(undefined));
}

function createService(bundles: Map<string, readonly string[]>): Okf {
  return {
    live: true,
    bundles(vault) {
      return listed(vault, bundles).map((root) => toBundle(vault, root));
    },
    scope(vault, path) {
      const choices = this.bundles(vault);
      const owner =
        path === undefined
          ? undefined
          : owningBundle(listed(vault, bundles), path);
      if (owner === undefined) {
        return { ambiguous: true, choices };
      }
      return {
        ambiguous: false,
        owner: toBundle(vault, owner),
        choices,
      };
    },
  };
}

function listed(
  vault: Vault,
  bundles: Map<string, readonly string[]>,
): readonly string[] {
  return bundles.get(vault.index.root) ?? [];
}

function toBundle(vault: Vault, root: string): OkfBundle {
  return {
    id: `${encodeURIComponent(vault.index.root)}:${encodeURIComponent(root)}`,
    name: root || "vault",
    root,
    vaultRoot: vault.index.root,
  };
}

function syncBundles(
  ctx: Context,
  bundles: Map<string, readonly string[]>,
): boolean {
  let changed = false;
  for (const vault of ctx.vaults.all()) {
    const next = detectBundles(bundleFiles(vault), manualBundles(ctx));
    const previous = bundles.get(vault.index.root) ?? [];
    if (!sameRoots(previous, next)) {
      bundles.set(vault.index.root, next);
      changed = true;
    }
  }
  return changed;
}

function sameRoots(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function bundleFiles(vault: Vault) {
  return vault.index.files().flatMap((file) => {
    if (!isMarkdownPath(file.path)) {
      return [];
    }
    const type = vault.index.metadata(file.path)?.frontmatter?.type;
    return [
      {
        path: file.path,
        markdown: true,
        ...(typeof type === "string" && type.trim()
          ? { type: type.trim() }
          : {}),
      },
    ];
  });
}

function manualBundles(ctx: Context): string[] {
  const value = ctx.settings.get<unknown>("okfCore.bundles", []);
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}
