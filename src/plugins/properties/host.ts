import type { Context, Plugin } from "../../kernel";
import type { PanelShell, Workbench } from "../../shared/runtime";
import type {} from "../vault/api";
import type {} from "./api";
import { canSetPropertyType } from "../../markdown/properties/types";
import { PropertyTypeStore } from "./type-store";
import { PropertyCollapseStore } from "./collapse-store";
import { vaultPropertyNames } from "./property-names";
import { protocol } from "./protocol";

interface PropertyStores {
  types: PropertyTypeStore;
  collapse: PropertyCollapseStore;
}
const stores = new WeakMap<Workbench, PropertyStores>();

export const propertiesHost: Plugin<{ panel: PanelShell }> = {
  name: "properties",
  inject: { required: ["rpc", "workbench", "vault"] },
  apply(ctx, { panel }) {
    const preferences = sharedStores(ctx.workbench);
    registerTypes(ctx, preferences.types);
    registerPropertyNames(ctx, preferences.types);
    registerDisclosure(ctx, preferences.collapse, panel.document.uri);
  },
};

function sharedStores(workbench: Workbench): PropertyStores {
  const storage = workbench.storage;
  if (!storage) {
    throw new Error("Property preference storage is unavailable");
  }
  let preferences = stores.get(workbench);
  if (!preferences) {
    preferences = {
      types: new PropertyTypeStore(storage),
      collapse: new PropertyCollapseStore(storage),
    };
    stores.set(workbench, preferences);
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
