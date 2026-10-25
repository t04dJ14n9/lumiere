import type { Context, Plugin } from "@workshop/core";
import type { PanelShell, WorkspaceStorage } from "../../shared/host";
import type {} from "../vault/api";
import type {} from "./api";
import { canSetPropertyType } from "../../markdown/properties/types";
import { joinContained } from "../../shared/workspace-path";
import { PropertyTypeStore } from "./type-store";
import { PropertyCollapseStore } from "./collapse-store";
import { vaultPropertyNames } from "./property-names";
import { protocol } from "./protocol";
import { loadVaultCssSnippets } from "./snippets";

interface PropertyStores {
  types: PropertyTypeStore;
  collapse: PropertyCollapseStore;
}
const stores = new WeakMap<WorkspaceStorage, PropertyStores>();

export const propertiesHost: Plugin<{ panel: PanelShell }> = {
  name: "properties",
  inject: {
    required: ["rpc", "storage", "vault"],
    optional: ["workspace", "settings"],
  },
  apply(ctx, { panel }) {
    const preferences = sharedStores(ctx.storage);
    registerTypes(ctx, preferences.types);
    registerPropertyNames(ctx, preferences.types);
    registerDisclosure(ctx, preferences.collapse, panel.document.uri);
    registerSnippets(ctx);
  },
};

/** One store per workspace storage, shared by every panel's properties. */
function sharedStores(storage: WorkspaceStorage): PropertyStores {
  let preferences = stores.get(storage);
  if (!preferences) {
    preferences = {
      types: new PropertyTypeStore(storage),
      collapse: new PropertyCollapseStore(storage),
    };
    stores.set(storage, preferences);
  }
  return preferences;
}

function registerTypes(ctx: Context, preferences: PropertyTypeStore): void {
  const scope = ctx.vault.root;
  ctx.effect(() =>
    ctx.rpc.handle(protocol, "types", () => preferences.read(scope)),
  );
  ctx.effect(() =>
    ctx.rpc.handle(protocol, "setType", async ({ key, kind }) => {
      if (!canSetPropertyType(key, kind ?? null)) {
        throw new Error("Invalid or reserved property type preference");
      }
      await preferences.set(scope, key, kind ?? null);
      return preferences.read(scope);
    }),
  );
  ctx.effect(() =>
    preferences.subscribe((root, types) => {
      if (root === scope) {
        ctx.rpc.notify(protocol, "types", types);
      }
    }),
  );
}

function registerPropertyNames(
  ctx: Context,
  preferences: PropertyTypeStore,
): void {
  ctx.effect(() =>
    ctx.rpc.handle(protocol, "names", () =>
      vaultPropertyNames(
        ctx.vault
          .files()
          .map((file) => ctx.vault.metadata(file.path)?.frontmatter),
        preferences.read(ctx.vault.root),
      ),
    ),
  );
}

function registerDisclosure(
  ctx: Context,
  disclosure: PropertyCollapseStore,
  note: string,
): void {
  ctx.effect(() =>
    ctx.rpc.handle(protocol, "collapsed", () => disclosure.read(note)),
  );
  ctx.effect(() =>
    ctx.rpc.handle(protocol, "setCollapsed", async ({ collapsed }) => {
      await disclosure.set(note, collapsed);
      return disclosure.read(note);
    }),
  );
  // Other panels of the same note follow; other notes do not.
  ctx.effect(() =>
    disclosure.subscribe((changed, collapsed) => {
      if (changed === note) {
        ctx.rpc.notify(protocol, "collapsed", collapsed);
      }
    }),
  );
}

function resolveSnippetsConfigFolder(ctx: Context): string {
  return (
    ctx.settings?.effective.get(
      "obsidianCompat.configFolder",
      ".obsidian",
      ctx.vault.root,
    ) ?? ".obsidian"
  );
}

function registerSnippets(ctx: Context): void {
  const readSnippets = async (): Promise<string[]> => {
    if (!ctx.workspace) {
      return [];
    }
    const snippets = await loadVaultCssSnippets(
      ctx.workspace,
      ctx.vault.root,
      resolveSnippetsConfigFolder(ctx),
    );
    return [...snippets];
  };
  ctx.effect(() => ctx.rpc.handle(protocol, "snippets", readSnippets));
  if (!ctx.workspace) {
    return;
  }
  const configDir = joinContained(
    ctx.vault.root,
    resolveSnippetsConfigFolder(ctx),
  );
  if (!configDir) {
    return;
  }
  const notifySnippets = () => {
    void readSnippets()
      .then((snippets) => {
        if (ctx.isLive) {
          ctx.rpc.notify(protocol, "snippets", snippets);
        }
      })
      .catch(() => {
        // Ignore transient watch read failures.
      });
  };
  const appearanceUri = joinContained(configDir, "appearance.json");
  if (appearanceUri) {
    ctx.effect(() => ctx.workspace!.watch(appearanceUri, notifySnippets));
  }
  const snippetsDir = joinContained(configDir, "snippets");
  if (snippetsDir) {
    ctx.effect(() => ctx.workspace!.watch(snippetsDir, notifySnippets));
  }
}
