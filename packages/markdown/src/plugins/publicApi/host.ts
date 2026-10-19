import type { Context, Plugin } from "@workshop/core";
import type {} from "../editor/api";
import type {} from "../vault/api";
import type {} from "../../shared/plugin-state";
/** The native adapter supplies the facade; service reads still obey kernel injection. */
export const publicApiHost: Plugin<{ create(context: Context): void }> = {
  name: "publicApi",
  inject: {
    required: [
      "editors",
      "selections",
      "pluginStates",
      "clipboard",
      "dialogs",
      "hostCommands",
      "hostDocuments",
      "settings",
      "workspace",
    ],
    optional: ["vaults"],
  },
  apply(ctx, options) {
    options.create(ctx);
  },
};
