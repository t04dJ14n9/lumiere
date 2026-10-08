import type { Plugin } from "../../kernel";
import type { PanelShell, Workbench } from "../../shared/runtime";
import type {} from "../vault/api";
import type {} from "./api";
import { validPropertyName } from "../../markdown/properties/types";
import { PropertyTypeStore } from "./type-store";
import { protocol } from "./protocol";
const stores = new WeakMap<Workbench, PropertyTypeStore>();
export const propertiesHost: Plugin<{ panel: PanelShell }> = {
  name: "properties",
  inject: { required: ["rpc", "workbench", "vault"] },
  apply(ctx) {
    const storage = ctx.workbench.storage;
    if (!storage) throw new Error("Property preference storage is unavailable");
    let store = stores.get(ctx.workbench);
    if (!store) {
      store = new PropertyTypeStore(storage);
      stores.set(ctx.workbench, store);
    }
    const preferences = store;
    const scope = ctx.vault.root;
    ctx.effect(() =>
      ctx.rpc.handle(protocol, "types", () => preferences.read(scope)),
    );
    ctx.effect(() =>
      ctx.rpc.handle(protocol, "setType", async ({ key, kind }) => {
        if (
          !validPropertyName(key) ||
          (kind === "tags" && key.toLowerCase() !== "tags")
        ) {
          throw new Error("Invalid property type preference");
        }
        await preferences.set(scope, key, kind ?? null);
        const types = preferences.read(scope);
        return types;
      }),
    );
    ctx.effect(() =>
      preferences.subscribe((root, types) => {
        if (root === scope) ctx.rpc.notify(protocol, "types", types);
      }),
    );
  },
};
