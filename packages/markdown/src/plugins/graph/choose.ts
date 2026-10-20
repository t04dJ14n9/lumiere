import type { Context } from "@workshop/core";
import { isInsideBundle } from "../../markdown/okf";
import type { OkfBundle } from "../okfCore/api";
import type { Vault } from "../vault/api";
import { selectScope } from "./scope";

export interface HeldScope {
  vault: Vault;
  bundle: OkfBundle;
  focusPath?: string;
}

/** Synthetic scope: every markdown note in the vault (`bundle.root === ""`). */
export function vaultWideBundle(vault: { index: { root: string } }): OkfBundle {
  return {
    id: `${encodeURIComponent(vault.index.root)}:`,
    name: "Whole vault",
    root: "",
    vaultRoot: vault.index.root,
  };
}

/**
 * Prepend a Whole-vault choice per vault so Obsidian-style vault graphs work
 * without an OKF bundle. Existing `root: ""` entries are left alone.
 */
export function withVaultWideChoices(
  vaults: Iterable<{ index: { root: string } }>,
  choices: readonly OkfBundle[],
): OkfBundle[] {
  const seen = new Set(choices.map((bundle) => scopeKey(bundle)));
  const wide: OkfBundle[] = [];
  for (const vault of vaults) {
    const candidate = vaultWideBundle(vault);
    const key = scopeKey(candidate);
    if (!seen.has(key)) {
      wide.push(candidate);
      seen.add(key);
    }
  }
  return [...wide, ...choices];
}

function scopeKey(bundle: OkfBundle): string {
  return `${bundle.vaultRoot}\0${bundle.root}`;
}

/** Resolve the bundle for this open. Dismissing the picker leaves the previous scope. */
export async function resolveScope(input: {
  ctx: Context;
  explicit: boolean;
  current?: HeldScope;
}): Promise<HeldScope | undefined | "dismissed"> {
  const located = await locateNote(input.ctx);
  const reported = located
    ? input.ctx.okf.scope(located.vault, located.path)
    : undefined;
  const choices = withVaultWideChoices(
    input.ctx.vaults.all(),
    reported ? reported.choices : allBundles(input.ctx),
  );
  const decision = selectScope({
    explicit: input.explicit,
    hasCurrent: !input.explicit && input.current !== undefined,
    ambiguous: reported ? reported.ambiguous : true,
    ...(reported?.owner ? { owner: reported.owner } : {}),
    choices,
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
  const picked = await input.ctx.dialogs.pick({
    placeholder: "Choose a graph scope",
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
      `${bundle.name} ${bundle.root || "(whole vault)"} ${bundle.vaultRoot}`
        .toLowerCase()
        .includes(needle),
    )
    .map((bundle) => ({
      label: bundle.name,
      description:
        bundle.root === ""
          ? bundle.vaultRoot || "(vault root)"
          : bundle.root || bundle.vaultRoot,
      value: bundle,
    }));
}

async function locateNote(ctx: Context) {
  const note = ctx.activeEditor.note();
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
