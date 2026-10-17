import type { Context } from "@workshop/core";
import { isInsideBundle } from "../../markdown/okf";
import type { HostViews } from "../../shared/runtime";
import type { OkfBundle } from "../okfCore/api";
import type { Vault } from "../vault/api";
import { selectScope } from "./scope";

export interface HeldScope {
  vault: Vault;
  bundle: OkfBundle;
  focusPath?: string;
}

/** Resolve the bundle for this open. Dismissing the picker leaves the previous scope. */
export async function resolveScope(input: {
  ctx: Context;
  views: HostViews;
  explicit: boolean;
  current?: HeldScope;
}): Promise<HeldScope | undefined | "dismissed"> {
  const located = await locateNote(input.ctx, input.views);
  const reported = located
    ? input.ctx.okf.scope(located.vault, located.path)
    : undefined;
  const decision = selectScope({
    explicit: input.explicit,
    hasCurrent: !input.explicit && input.current !== undefined,
    ambiguous: reported ? reported.ambiguous : true,
    ...(reported?.owner ? { owner: reported.owner } : {}),
    choices: reported ? reported.choices : allBundles(input.ctx),
  });
  if (decision.kind === "keep") {
    return input.current;
  }
  if (decision.kind === "empty") {
    return undefined;
  }
  if (decision.kind === "use") {
    return hold(input.ctx, decision.bundle, located?.path);
  }
  const picked = await input.views.pick({
    placeholder: "Choose an OKF bundle",
    items: (query) => bundleItems(decision.choices, query),
  });
  if (!picked?.item) {
    return "dismissed";
  }
  return hold(input.ctx, picked.item.value, located?.path);
}

function bundleItems(choices: readonly OkfBundle[], query: string) {
  const needle = query.trim().toLowerCase();
  return choices
    .filter((bundle) =>
      `${bundle.name} ${bundle.root}`.toLowerCase().includes(needle),
    )
    .map((bundle) => ({
      label: bundle.name,
      description: bundle.root || bundle.vaultRoot,
      value: bundle,
    }));
}

async function locateNote(ctx: Context, views: HostViews) {
  const note = views.activeNote();
  if (typeof note !== "string" || note.length === 0) {
    return undefined;
  }
  const located = await ctx.vaults.locate(note);
  if (!located || typeof located.path !== "string") {
    return undefined;
  }
  return located;
}

function allBundles(ctx: Context): OkfBundle[] {
  const bundles: OkfBundle[] = [];
  for (const vault of ctx.vaults.all()) {
    const listed = ctx.okf.bundles(vault);
    if (Array.isArray(listed)) {
      bundles.push(...listed);
    }
  }
  return bundles;
}

function hold(
  ctx: Context,
  bundle: OkfBundle,
  path: string | undefined,
): HeldScope | undefined {
  let vault: Vault | undefined;
  for (const candidate of ctx.vaults.all()) {
    if (candidate.index.root === bundle.vaultRoot) {
      vault = candidate;
    }
  }
  if (!vault) {
    return undefined;
  }
  const focusPath =
    path && isInsideBundle(path, bundle.root) ? path : undefined;
  return { vault, bundle, ...(focusPath ? { focusPath } : {}) };
}
