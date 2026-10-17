import type { Context, Plugin } from "@workshop/core";
import type {} from "../editor/api";
import type {} from "../vault/api";
import type {} from "../../shared/plugin-state";
/** The native adapter supplies the facade; service reads still obey kernel injection. */
export const publicApiHost: Plugin<{ create(context: Context): void }> = {
  name: "publicApi",
  inject: {
    required: ["workshop", "editors", "selections", "pluginStates"],
    optional: ["vaults"],
  },
  apply(ctx, options) {
    options.create(ctx);
  },
};
